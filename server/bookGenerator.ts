import { storage } from './storage';
import OpenAI, { toFile } from 'openai';
import pRetry from 'p-retry';
import PQueue from 'p-queue';
import { assemblePDF } from './pdfAssembler';
import { sendBookReadyEmail } from './emailClient';

// Set to true for faster testing iterations (5 pages instead of 30)
const TEST_MODE = true;
const TOTAL_PAGES = TEST_MODE ? 5 : 30;
const COVER_PAGE = 1;

// Parallel processing configuration
// OpenAI image edit typically allows ~5 requests/minute, so we process 2-3 concurrently
// with rate limiting to stay within quota. This is still ~3x faster than sequential.
const CONCURRENT_GENERATIONS = 2;

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Image generation queue with concurrency and rate limiting
// intervalCap: max 4 requests per minute (conservative vs 5/min limit)
// concurrency: max 2 running at same time
const imageQueue = new PQueue({ 
  concurrency: CONCURRENT_GENERATIONS,
  intervalCap: 4,
  interval: 60000, // Per minute rate limit
});

// Cache for prepared reference images (avoid re-processing for each page)
interface PreparedImage {
  imageFile: Awaited<ReturnType<typeof toFile>>;
  timestamp: number;
}
const preparedImageCache = new Map<string, PreparedImage>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

// Prepare and cache reference image for reuse across all pages
async function getPreparedImage(referenceImageData: string, cacheKey: string): Promise<Awaited<ReturnType<typeof toFile>>> {
  const cached = preparedImageCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[generator] Using cached reference image for ${cacheKey}`);
    return cached.imageFile;
  }

  console.log(`[generator] Preparing reference image for ${cacheKey}`);
  const base64Data = referenceImageData.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const imageFile = await toFile(imageBuffer, 'reference.png', { type: 'image/png' });
  
  preparedImageCache.set(cacheKey, { imageFile, timestamp: Date.now() });
  
  // Clean up old cache entries
  for (const [key, value] of preparedImageCache.entries()) {
    if (Date.now() - value.timestamp > CACHE_TTL) {
      preparedImageCache.delete(key);
    }
  }
  
  return imageFile;
}

async function generateBook(orderId: string): Promise<void> {
  const startTime = Date.now();
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
  
  // Pre-cache the reference image for all pages
  const referenceImage = story.originalImageData || story.characterImageData;
  const cacheKey = `order-${orderId}`;
  await getPreparedImage(referenceImage, cacheKey);
  console.log(`[generator] Reference image cached for order ${orderId}`);
  
  // Generate cover first (sequential - single page)
  console.log(`[generator] Generating cover for "${story.characterName}"`);
  try {
    const coverImageData = await generateCoverPage(story, cacheKey);
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

  // Build all page generation tasks
  interface PageTask {
    pageNumber: number;
    sectionIdx: number;
    scenePrompt: string;
    sectionText: string;
  }
  
  const pageTasks: PageTask[] = [];
  const pagesPerSection = Math.floor(TOTAL_PAGES / story.sections.length);
  let pageNumber = 1;

  for (let sectionIdx = 0; sectionIdx < story.sections.length; sectionIdx++) {
    const section = story.sections[sectionIdx];
    const sectionPagesCount = sectionIdx === story.sections.length - 1 
      ? TOTAL_PAGES - pageNumber + 1  
      : pagesPerSection;
    
    for (let i = 0; i < sectionPagesCount; i++) {
      const scenePrompt = createScenePrompt(
        story.characterName,
        story.storyType,
        section.generatedText,
        i,
        sectionPagesCount
      );
      
      pageTasks.push({
        pageNumber,
        sectionIdx,
        scenePrompt,
        sectionText: section.generatedText.substring(0, 500),
      });
      
      pageNumber++;
    }
  }

  console.log(`[generator] Generating ${pageTasks.length} pages in parallel (concurrency: ${CONCURRENT_GENERATIONS})`);

  // Process pages in parallel using p-queue
  const pageResults: { pageNumber: number; success: boolean; error?: any }[] = [];
  
  const generatePageTask = async (task: PageTask) => {
    try {
      console.log(`[generator] Starting page ${task.pageNumber}...`);
      
      const imageData = await generateIllustrationWithCachedReference(
        task.scenePrompt,
        cacheKey,
        story.characterName
      );
      
      await storage.createBookPage({
        orderId,
        pageNumber: task.pageNumber,
        pageType: 'illustration',
        imageData,
        imagePrompt: task.scenePrompt,
        storyText: task.sectionText,
      });
      
      pagesGenerated++;
      await storage.updateOrder(orderId, { pagesGenerated });
      
      console.log(`[generator] Page ${task.pageNumber} complete (${pagesGenerated}/${totalPages})`);
      
      return { pageNumber: task.pageNumber, success: true };
    } catch (err) {
      console.error(`[generator] Failed to generate page ${task.pageNumber}:`, err);
      return { pageNumber: task.pageNumber, success: false, error: err };
    }
  };

  // Add all tasks to the queue
  const promises = pageTasks.map(task => imageQueue.add(() => generatePageTask(task)));
  const results = await Promise.all(promises);
  
  // Check for failures - if any pages failed, mark the order as failed
  const failures = results.filter(r => r && !r.success);
  if (failures.length > 0) {
    console.error(`[generator] ${failures.length} pages failed to generate - marking order as failed`);
    preparedImageCache.delete(cacheKey);
    await storage.updateOrder(orderId, { 
      status: 'failed',
      pagesGenerated 
    });
    throw new Error(`Failed to generate ${failures.length} pages`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[generator] All ${pageTasks.length} pages generated for order ${orderId} in ${elapsed}s`);
  
  // Clean up cache
  preparedImageCache.delete(cacheKey);
  
  try {
    console.log(`[generator] Assembling PDF for order ${orderId}`);
    const downloadUrl = await assemblePDF(orderId);
    
    // Only mark as completed with actual pages generated count
    const actualPagesGenerated = pagesGenerated;
    await storage.updateOrder(orderId, { 
      status: 'completed',
      pagesGenerated: actualPagesGenerated,
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
    // Mark as failed if PDF assembly fails, not completed
    await storage.updateOrder(orderId, { 
      status: 'failed',
      pagesGenerated,
    });
  }
}

async function generateCoverPage(story: any, cacheKey: string): Promise<string> {
  const prompt = `A children's coloring book cover page with bold black line art on white background.
Show the main character (matching the reference image exactly - same face, hair, body shape) in the center.
Add decorative elements like stars, swirls, or flowers around the character.
Style: Bold clean lines (3-4px black), simple shapes, high contrast, perfect for children to color.
IMPORTANT: Illustration only - absolutely NO text, NO letters, NO words, NO titles, NO captions, NO writing of any kind.
Return ONLY the illustration artwork with the character and decorative elements.`;

  return await generateIllustrationWithCachedReference(prompt, cacheKey, story.characterName);
}

// Generate illustration using cached reference image
async function generateIllustrationWithCachedReference(
  prompt: string,
  cacheKey: string,
  characterName: string
): Promise<string> {
  const cached = preparedImageCache.get(cacheKey);
  if (!cached) {
    throw new Error(`No cached image found for ${cacheKey}`);
  }

  const fullPrompt = `${prompt}

CHARACTER REFERENCE: Match the character in the reference image exactly - same facial features, hair, body proportions.
STYLE: Children's coloring book page - bold black line art (3-4px), white background, high contrast, simple shapes.
NO TEXT ALLOWED: Do not include ANY text, letters, words, titles, captions, labels, or writing in the image whatsoever.
Return ONLY the illustration - no text elements of any kind.`;

  return await pRetry(
    async () => {
      // Use the images.edit endpoint with the cached character reference image
      const response = await openai.images.edit({
        model: 'gpt-image-1',
        image: cached.imageFile,
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
        const isRateLimit = (error as any)?.status === 429;
        if (isRateLimit) {
          console.log(`[generator] Rate limited, backing off...`);
        }
        console.log(
          `[generator] Image generation attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left.`
        );
      },
      minTimeout: 2000,
      maxTimeout: 30000, // Longer max timeout for rate limits
      factor: 2.5, // More aggressive backoff for rate limits
    }
  );
}

// Legacy function for backward compatibility
export async function generateIllustrationWithReference(
  prompt: string, 
  referenceImageData: string,
  characterName: string
): Promise<string> {
  const fullPrompt = `${prompt}

CHARACTER REFERENCE: Match the character in the reference image exactly - same facial features, hair, body proportions.
STYLE: Children's coloring book page - bold black line art (3-4px), white background, high contrast, simple shapes.
NO TEXT ALLOWED: Do not include ANY text, letters, words, titles, captions, labels, or writing in the image whatsoever.
Return ONLY the illustration - no text elements of any kind.`;

  return await pRetry(
    async () => {
      // Extract base64 data from data URL if present
      const base64Data = referenceImageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      // Use toFile helper from OpenAI SDK (works in Node.js)
      const imageFile = await toFile(imageBuffer, 'reference.png', { type: 'image/png' });
      
      // Use the images.edit endpoint with the character reference image
      const response = await openai.images.edit({
        model: 'gpt-image-1',
        image: imageFile,
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

function createScenePrompt(
  characterName: string,
  storyType: string,
  sectionText: string,
  pageIndex: number,
  totalPagesInSection: number
): string {
  const sceneDescriptions = [
    'the beginning of the adventure',
    'an exciting moment',
    'meeting new friends',
    'facing a challenge',
    'a moment of discovery',
    'celebrating success',
  ];
  
  const sceneType = sceneDescriptions[pageIndex % sceneDescriptions.length];
  
  return `Coloring book illustration: ${characterName} during ${sceneType}.
Show the character actively engaged. Style: bold black line art on white background.
NO TEXT in the image.`;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
