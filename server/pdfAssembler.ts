// PDF Assembler using pdfkit with SVG support for crisp, print-quality output
import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { storage } from './storage';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { vectorizeColoringPage, parseSvgDimensions } from './vectorizer';

const UPLOADS_DIR = './uploads/books';
const OSWALD_FONT_PATH = './assets/fonts/Oswald-Variable.ttf';

// Letter size in points (72 points per inch)
const PAGE_WIDTH = 612;  // 8.5 inches
const PAGE_HEIGHT = 792; // 11 inches
const MARGIN = 36;       // 0.5 inch margin
const TEXT_AREA_HEIGHT = 80; // Space for story text at bottom

// Helper function to wrap text to fit within a given width
function wrapText(text: string, doc: PDFKit.PDFDocument, fontSize: number, maxWidth: number): string[] {
  doc.fontSize(fontSize);
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = doc.widthOfString(testLine);
    
    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

export async function assemblePDF(orderId: string): Promise<string> {
  console.log(`[pdf] Starting PDF assembly for order ${orderId}`);
  
  const order = await storage.getOrder(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }
  
  const story = await storage.getStory(order.storyId);
  if (!story) {
    throw new Error(`Story ${order.storyId} not found`);
  }
  
  const pages = await storage.getBookPages(orderId);
  if (pages.length === 0) {
    throw new Error(`No pages found for order ${orderId}`);
  }
  
  pages.sort((a, b) => a.pageNumber - b.pageNumber);
  
  // Create PDF document with no auto margins (we handle positioning manually)
  const doc = new PDFDocument({
    size: 'LETTER',
    margin: 0, // We handle margins manually for precise control
    autoFirstPage: false,
  });
  
  // Register custom font
  let fontName = 'Helvetica';
  try {
    if (fs.existsSync(OSWALD_FONT_PATH)) {
      doc.registerFont('Oswald', OSWALD_FONT_PATH);
      fontName = 'Oswald';
      console.log('[pdf] Custom Oswald font loaded successfully');
    }
  } catch (err) {
    console.log('[pdf] Could not load Oswald font, using Helvetica fallback');
  }
  
  // Ensure output directory exists
  await fsPromises.mkdir(UPLOADS_DIR, { recursive: true });
  
  const fileName = `${story.characterName.replace(/[^a-zA-Z0-9]/g, '-')}-coloring-book-${orderId}.pdf`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  
  // Create write stream
  const writeStream = fs.createWriteStream(filePath);
  doc.pipe(writeStream);

  for (const bookPage of pages) {
    if (!bookPage.imageData) {
      console.log(`[pdf] Skipping page ${bookPage.pageNumber} - no image data`);
      continue;
    }
    
    try {
      doc.addPage();
      
      const hasStoryText = bookPage.pageNumber > 0 && bookPage.storyText;
      const imageAreaHeight = hasStoryText 
        ? PAGE_HEIGHT - (MARGIN * 2) - TEXT_AREA_HEIGHT 
        : PAGE_HEIGHT - (MARGIN * 2);
      const imageAreaWidth = PAGE_WIDTH - (MARGIN * 2);
      
      // Try to vectorize the image for crisp print quality
      let useVector = false;
      let svgContent = '';
      
      try {
        console.log(`[pdf] Vectorizing page ${bookPage.pageNumber}...`);
        svgContent = await vectorizeColoringPage(bookPage.imageData);
        useVector = true;
        console.log(`[pdf] Page ${bookPage.pageNumber} vectorized successfully`);
      } catch (vectorErr) {
        console.log(`[pdf] Vectorization failed for page ${bookPage.pageNumber}, using raster fallback`);
      }
      
      // pdfkit uses top-left origin (y increases downward)
      // Image should be at top, story text at bottom
      
      if (useVector && svgContent) {
        // Use SVG vector graphics for crisp output
        // Parse SVG dimensions using helper function (handles viewBox correctly)
        const { width: svgWidth, height: svgHeight } = parseSvgDimensions(svgContent);
        
        // Calculate scale to fit image area while maintaining aspect ratio
        const aspectRatio = svgWidth / svgHeight;
        let drawWidth = imageAreaWidth;
        let drawHeight = drawWidth / aspectRatio;
        
        if (drawHeight > imageAreaHeight) {
          drawHeight = imageAreaHeight;
          drawWidth = drawHeight * aspectRatio;
        }
        
        // Center image in the image area (at top of page)
        const x = MARGIN + (imageAreaWidth - drawWidth) / 2;
        const y = MARGIN + (imageAreaHeight - drawHeight) / 2;
        
        // Render SVG to PDF with proper scaling
        SVGtoPDF(doc, svgContent, x, y, {
          width: drawWidth,
          height: drawHeight,
          preserveAspectRatio: 'xMidYMid meet',
        });
      } else {
        // Fallback to raster image
        const imageData = bookPage.imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(imageData, 'base64');
        
        // Place image at top of page
        doc.image(imageBuffer, MARGIN, MARGIN, {
          fit: [imageAreaWidth, imageAreaHeight],
          align: 'center',
          valign: 'center',
        });
      }
      
      // Add story text at the bottom of the page
      if (hasStoryText && bookPage.storyText) {
        const textMaxWidth = PAGE_WIDTH - (MARGIN * 2);
        const fontSize = 11;
        const lineHeight = fontSize * 1.4;
        
        doc.font(fontName).fontSize(fontSize);
        
        // Wrap the story text to fit
        const wrappedLines = wrapText(bookPage.storyText, doc, fontSize, textMaxWidth);
        
        // Limit to 4 lines max
        const displayLines = wrappedLines.slice(0, 4);
        if (wrappedLines.length > 4) {
          displayLines[3] = displayLines[3].substring(0, displayLines[3].length - 3) + '...';
        }
        
        // Draw text at the bottom of the page, above the page number
        // TEXT_AREA_HEIGHT reserves space at bottom for text
        const textAreaTop = PAGE_HEIGHT - MARGIN - TEXT_AREA_HEIGHT;
        let textY = textAreaTop + 10; // Start 10pt into the text area
        doc.fillColor('#333333');
        
        for (const line of displayLines) {
          const lineWidth = doc.widthOfString(line);
          doc.text(line, (PAGE_WIDTH - lineWidth) / 2, textY, {
            lineBreak: false,
          });
          textY += lineHeight;
        }
      }
      
      // Add page number (except for cover) at very bottom
      if (bookPage.pageNumber > 0) {
        doc.font(fontName).fontSize(9).fillColor('#999999');
        const pageNumText = `Page ${bookPage.pageNumber}`;
        const pageNumWidth = doc.widthOfString(pageNumText);
        doc.text(pageNumText, (PAGE_WIDTH - pageNumWidth) / 2, PAGE_HEIGHT - MARGIN - 15, {
          lineBreak: false,
        });
      }
      
      console.log(`[pdf] Added page ${bookPage.pageNumber} to PDF (${useVector ? 'vector' : 'raster'})`);
    } catch (err) {
      console.error(`[pdf] Failed to add page ${bookPage.pageNumber}:`, err);
    }
  }
  
  // Finalize PDF
  doc.end();
  
  // Wait for write to complete
  await new Promise<void>((resolve, reject) => {
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
  
  console.log(`[pdf] PDF saved to ${filePath}`);
  
  const downloadUrl = `/downloads/${fileName}`;
  
  return downloadUrl;
}
