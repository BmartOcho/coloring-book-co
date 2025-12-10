import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { storage } from './storage';
import fs from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = './uploads/books';

// Helper function to wrap text to fit within a given width
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    
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
  
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 36;
  const textAreaHeight = 100; // Space reserved for story text at bottom

  for (const bookPage of pages) {
    if (!bookPage.imageData) {
      console.log(`[pdf] Skipping page ${bookPage.pageNumber} - no image data`);
      continue;
    }
    
    try {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      const imageData = bookPage.imageData.replace(/^data:image\/\w+;base64,/, '');
      const imageBytes = Uint8Array.from(Buffer.from(imageData, 'base64'));
      
      let image;
      if (bookPage.imageData.includes('image/jpeg')) {
        image = await pdfDoc.embedJpg(imageBytes);
      } else {
        image = await pdfDoc.embedPng(imageBytes);
      }
      
      const imgDims = image.scale(1);
      const aspectRatio = imgDims.width / imgDims.height;
      
      // Reserve space for text at the bottom for non-cover pages
      const hasStoryText = bookPage.pageNumber > 0 && bookPage.storyText;
      const imageMaxHeight = hasStoryText 
        ? pageHeight - (margin * 2) - textAreaHeight 
        : pageHeight - (margin * 2);
      const maxWidth = pageWidth - (margin * 2);
      
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      
      if (drawHeight > imageMaxHeight) {
        drawHeight = imageMaxHeight;
        drawWidth = drawHeight * aspectRatio;
      }
      
      const x = (pageWidth - drawWidth) / 2;
      // Position image higher to leave room for text
      const y = hasStoryText 
        ? textAreaHeight + margin + (imageMaxHeight - drawHeight) / 2
        : (pageHeight - drawHeight) / 2;
      
      page.drawImage(image, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });
      
      // Add story text at the bottom of the page
      if (hasStoryText && bookPage.storyText) {
        const textMaxWidth = pageWidth - (margin * 2);
        const fontSize = 10;
        const lineHeight = fontSize * 1.4;
        
        // Wrap the story text to fit
        const wrappedLines = wrapText(bookPage.storyText, italicFont, fontSize, textMaxWidth);
        
        // Limit to 6 lines max to fit in the text area
        const displayLines = wrappedLines.slice(0, 6);
        if (wrappedLines.length > 6) {
          displayLines[5] = displayLines[5].substring(0, displayLines[5].length - 3) + '...';
        }
        
        // Draw each line centered
        let textY = margin + textAreaHeight - 20;
        for (const line of displayLines) {
          const lineWidth = italicFont.widthOfTextAtSize(line, fontSize);
          page.drawText(line, {
            x: (pageWidth - lineWidth) / 2,
            y: textY,
            size: fontSize,
            font: italicFont,
            color: rgb(0.3, 0.3, 0.3),
          });
          textY -= lineHeight;
        }
      }
      
      // Add page number
      if (bookPage.pageNumber > 0) {
        page.drawText(`Page ${bookPage.pageNumber}`, {
          x: pageWidth / 2 - 20,
          y: 15,
          size: 9,
          font,
          color: rgb(0.6, 0.6, 0.6),
        });
      }
      
      console.log(`[pdf] Added page ${bookPage.pageNumber} to PDF`);
    } catch (err) {
      console.error(`[pdf] Failed to add page ${bookPage.pageNumber}:`, err);
    }
  }
  
  const pdfBytes = await pdfDoc.save();
  
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  
  const fileName = `${story.characterName.replace(/[^a-zA-Z0-9]/g, '-')}-coloring-book-${orderId}.pdf`;
  const filePath = path.join(UPLOADS_DIR, fileName);
  
  await fs.writeFile(filePath, pdfBytes);
  
  console.log(`[pdf] PDF saved to ${filePath}`);
  
  const downloadUrl = `/downloads/${fileName}`;
  
  return downloadUrl;
}
