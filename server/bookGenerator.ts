import { storage } from './storage';
import OpenAI from 'openai';
import pRetry from 'p-retry';
import { assemblePDF } from './pdfAssembler';
import { sendBookReadyEmail } from './emailClient';

// Set to true for faster testing iterations (5 pages instead of 25)
const TEST_MODE = true;
const TOTAL_PAGES = TEST_MODE ? 5 : 25;
const COVER_PAGE = 1;

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const generationQueue: string[] = [];
let isProcessing = false;

export async function startBookGeneration(orderId: string): Promise<void> {
  console.log(`[generator] Queueing book generation for order ${orderId}`);
  generationQueue.push(orderId);
  processQueue();
}

async function processQueue(): Promise<void> {
  if (isProcessing || generationQueue.length === 0) {
    return;
  }

  isProcessing = true;
  
  while (generationQueue.length > 0) {
    const orderId = generationQueue.shift()!;
    try {
      await generateBook(orderId);
    } catch (err) {
      console.error(`[generator] Failed to generate book for order ${orderId}:`, err);
      await storage.updateOrder(orderId, { status: 'failed' });
    }
  }
  
  isProcessing = false;
}

async function generateBook(orderId: string): Promise<void> {
  console.log(`[generator] Starting book generation for order ${orderId}`);
  
  const order = await storage.getOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Idempotency check - don't regenerate if already processing or complete
  if (order.status === 'generating' || order.status === 'completed') {
    console.log(`[generator] Order ${orderId} already in ${order.status} state, skipping`);
    return;
  }
  
  const story = await storage.getStory(order.storyId);
  if (!story) {
    throw new Error(`Story ${order.storyId} not found`);
  }

  // Validate story has sections
  if (!story.sections || story.sections.length === 0) {
    console.error(`[generator] Story ${order.storyId} has no sections, cannot generate book`);
    await storage.updateOrder(orderId, { status: 'failed' });
    throw new Error(`Story ${order.storyId} has no sections`);
  }
  
  await storage.updateOrder(orderId, { status: 'generating' });
  
  const totalPages = TOTAL_PAGES + COVER_PAGE;
  let pagesGenerated = 0;
  
  console.log(`[generator] Generating cover for "${story.characterName}"`);
  try {
    const coverImageData = await generateCoverPage(story);
    await storage.createBookPage({
      orderId,
      pageNumber: 0,
      pageType: 'cover',
      imageData: coverImageData,
      imagePrompt: `Cover page for ${story.characterName}'s story`,
    });
    pagesGenerated++;
    await storage.updateOrder(orderId, { pagesGenerated });
    console.log(`[generator] Cover page complete (${pagesGenerated}/${totalPages})`);
  } catch (err) {
    console.error(`[generator] Failed to generate cover:`, err);
    throw err;
  }

  const pagesPerSection = Math.floor(TOTAL_PAGES / story.sections.length);
  let pageNumber = 1;

  for (let sectionIdx = 0; sectionIdx < story.sections.length; sectionIdx++) {
    const section = story.sections[sectionIdx];
    const sectionPagesCount = sectionIdx === story.sections.length - 1 
      ? TOTAL_PAGES - pageNumber + 1  
      : pagesPerSection;

    console.log(`[generator] Generating ${sectionPagesCount} pages for section ${sectionIdx + 1}`);
    
    for (let i = 0; i < sectionPagesCount; i++) {
      try {
        const scenePrompt = createScenePrompt(
          story.characterName,
          story.storyType,
          section.generatedText,
          i,
          sectionPagesCount
        );
        
        // Use character reference image for all illustrations
        const imageData = await generateIllustrationWithReference(
          scenePrompt, 
          story.characterImageData, 
          story.characterName
        );
        
        await storage.createBookPage({
          orderId,
          pageNumber,
          pageType: 'illustration',
          imageData,
          imagePrompt: scenePrompt,
          storyText: section.generatedText.substring(0, 500),
        });
        
        pagesGenerated++;
        pageNumber++;
        await storage.updateOrder(orderId, { pagesGenerated });
        
        console.log(`[generator] Page ${pageNumber - 1} complete (${pagesGenerated}/${totalPages})`);
        
        await delay(1000);
      } catch (err) {
        console.error(`[generator] Failed to generate page ${pageNumber}:`, err);
        throw err;
      }
    }
  }
  
  console.log(`[generator] Book generation complete for order ${orderId}`);
  
  try {
    console.log(`[generator] Assembling PDF for order ${orderId}`);
    const downloadUrl = await assemblePDF(orderId);
    
    await storage.updateOrder(orderId, { 
      status: 'completed',
      pagesGenerated: totalPages,
      pdfUrl: downloadUrl,
      completedAt: new Date(),
    });
    
    console.log(`[generator] PDF ready at ${downloadUrl}`);
    
    if (order.email) {
      console.log(`[generator] Sending email notification to ${order.email}`);
      // Build full download URL for email
      const baseUrl = process.env.REPLIT_DOMAINS?.split(',')[0] || 'localhost:5000';
      const protocol = baseUrl.includes('localhost') ? 'http' : 'https';
      const fullDownloadUrl = `${protocol}://${baseUrl}/api/downloads/${orderId}`;
      
      const emailSent = await sendBookReadyEmail(
        order.email,
        story.characterName,
        fullDownloadUrl
      );
      if (emailSent) {
        console.log(`[generator] Email sent successfully to ${order.email}`);
      } else {
        console.log(`[generator] Failed to send email to ${order.email}`);
      }
    }
  } catch (err) {
    console.error(`[generator] Failed to assemble PDF:`, err);
    await storage.updateOrder(orderId, { 
      status: 'completed',
      pagesGenerated: totalPages,
      completedAt: new Date(),
    });
  }
}

async function generateCoverPage(story: any): Promise<string> {
  const prompt = `Create a charming children's coloring book cover page.
The cover should show the EXACT same character from the reference image as the main character, ready to go on an adventure.
CRITICAL: The character MUST look exactly like the character in the reference image - same features, same style, same proportions.
Style: Clean line art, bold outlines (3-4px black lines), simple backgrounds, perfect for coloring.
Include decorative border elements. Make it inviting and exciting for children.
Text area at top for title "${story.characterName}'s Adventure". Portrait orientation.`;

  return await generateIllustrationWithReference(prompt, story.characterImageData, story.characterName);
}

async function generateIllustrationWithReference(
  prompt: string, 
  referenceImageData: string,
  characterName: string
): Promise<string> {
  const fullPrompt = `Create a children's coloring book page illustration.
${prompt}

CRITICAL CHARACTER REFERENCE INSTRUCTIONS:
- You MUST base the main character EXACTLY on the reference image provided
- The character should have the SAME facial features, hair style, body proportions, and overall appearance as in the reference
- Keep the character consistent with their look in the reference image throughout

STYLE REQUIREMENTS:
- Clean, bold black outlines (3-4 pixel thickness)
- Pure white background
- No shading or gradients - just line art
- Simple, child-friendly details
- Large, easy-to-color areas
- Portrait orientation
- Cartoon style suitable for ages 4-10
- Character "${characterName}" MUST match the reference image exactly`;

  return await pRetry(
    async () => {
      // Extract base64 data from data URL if present
      const base64Data = referenceImageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Use the images.edit endpoint with the character reference image
      const response = await openai.images.edit({
        model: 'gpt-image-1',
        image: new File([imageBuffer], 'reference.png', { type: 'image/png' }),
        prompt: fullPrompt,
        n: 1,
        size: '1024x1536',
      });

      const imageUrl = response.data?.[0]?.url || response.data?.[0]?.b64_json;
      if (!imageUrl) {
        throw new Error('No image data returned from OpenAI');
      }

      if (imageUrl.startsWith('http')) {
        const imageResponse = await fetch(imageUrl);
        const buffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:image/png;base64,${base64}`;
      }
      
      return `data:image/png;base64,${imageUrl}`;
    },
    {
      retries: 3,
      onFailedAttempt: (error) => {
        console.log(
          `[generator] Image generation attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
        );
      },
      minTimeout: 2000,
      maxTimeout: 10000,
    }
  );
}

// Fallback generation without reference (for cases where image edit fails)
async function generateIllustration(prompt: string, characterName: string): Promise<string> {
  const fullPrompt = `Create a children's coloring book page illustration in Disney-Pixar style.
${prompt}

IMPORTANT STYLE REQUIREMENTS:
- Clean, bold black outlines (3-4 pixel thickness)
- Pure white background
- No shading or gradients - just line art
- Simple, child-friendly details
- Large, easy-to-color areas
- Portrait orientation (1024x1536)
- Cartoon style suitable for ages 4-10
Character "${characterName}" should be recognizable across all pages.`;

  return await pRetry(
    async () => {
      const response = await openai.images.generate({
        model: 'gpt-image-1',
        prompt: fullPrompt,
        n: 1,
        size: '1024x1536',
        quality: 'high',
      });

      const imageUrl = response.data?.[0]?.url || response.data?.[0]?.b64_json;
      if (!imageUrl) {
        throw new Error('No image data returned from OpenAI');
      }

      if (imageUrl.startsWith('http')) {
        const imageResponse = await fetch(imageUrl);
        const buffer = await imageResponse.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        return `data:image/png;base64,${base64}`;
      }
      
      return `data:image/png;base64,${imageUrl}`;
    },
    {
      retries: 3,
      onFailedAttempt: (error) => {
        console.log(
          `[generator] Image generation attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
        );
      },
      minTimeout: 2000,
      maxTimeout: 10000,
    }
  );
}

function createScenePrompt(
  characterName: string,
  storyType: string,
  sectionText: string,
  pageIndex: number,
  totalPagesInSection: number
): string {
  const textWords = sectionText.split(' ');
  const wordsPerPage = Math.ceil(textWords.length / totalPagesInSection);
  const startIdx = pageIndex * wordsPerPage;
  const endIdx = Math.min(startIdx + wordsPerPage, textWords.length);
  const pageContext = textWords.slice(startIdx, endIdx).join(' ');
  
  const sceneDescriptions = [
    'the beginning of the adventure',
    'an exciting moment',
    'meeting new friends',
    'facing a challenge',
    'a moment of discovery',
    'celebrating success',
  ];
  
  const sceneType = sceneDescriptions[pageIndex % sceneDescriptions.length];
  
  return `Scene: ${characterName} during ${sceneType}.
Story context: "${pageContext.substring(0, 150)}..."
Story type: ${storyType}
Show ${characterName} actively engaged in this moment of their journey.`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
