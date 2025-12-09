import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { storage } from './storage';
import fs from 'fs/promises';
import path from 'path';

const UPLOADS_DIR = './uploads/books';

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
  
  const pageWidth = 612;
  const pageHeight = 792;

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
      
      const margin = 36;
      const maxWidth = pageWidth - (margin * 2);
      const maxHeight = pageHeight - (margin * 2);
      
      let drawWidth = maxWidth;
      let drawHeight = drawWidth / aspectRatio;
      
      if (drawHeight > maxHeight) {
        drawHeight = maxHeight;
        drawWidth = drawHeight * aspectRatio;
      }
      
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;
      
      page.drawImage(image, {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
      });
      
      if (bookPage.pageNumber > 0) {
        page.drawText(`Page ${bookPage.pageNumber}`, {
          x: pageWidth / 2 - 20,
          y: 20,
          size: 10,
          font,
          color: rgb(0.5, 0.5, 0.5),
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
