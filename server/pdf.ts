import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";
import { Buffer } from "node:buffer";
import { vectorizeImageFromBase64 } from "./vectorize";

export async function generateColoringBookPDF(imageBase64: string): Promise<Buffer> {
  // First vectorize the image for crisp, clean lines
  const svg = await vectorizeImageFromBase64(imageBase64, {
    threshold: 128,
    turdSize: 2,
    optCurve: true,
    optTolerance: 0.2,
  });

  // 8.5 x 11 inches at 72 DPI
  const doc = new PDFDocument({
    size: "Letter",
    margin: 0.5 * 72, // 0.5 inch margins
  });

  // Calculate dimensions to fit on page while maintaining aspect ratio
  const pageWidth = doc.page.width - 2 * (0.5 * 72);
  const pageHeight = doc.page.height - 2 * (0.5 * 72);
  const maxWidth = pageWidth;
  const maxHeight = pageHeight;

  // Original image is 1024x1536 (2:3 ratio)
  const imgAspectRatio = 1024 / 1536;
  let imgWidth = maxWidth;
  let imgHeight = imgWidth / imgAspectRatio;

  if (imgHeight > maxHeight) {
    imgHeight = maxHeight;
    imgWidth = imgHeight * imgAspectRatio;
  }

  // Center on page
  const xPos = (doc.page.width - imgWidth) / 2;
  const yPos = (doc.page.height - imgHeight) / 2;

  // Embed the vectorized SVG for crisp, resolution-independent lines
  SVGtoPDF(doc, svg, xPos, yPos, {
    width: imgWidth,
    height: imgHeight,
    preserveAspectRatio: "xMidYMid meet",
  });

  // Collect chunks and return as buffer
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

interface PreparedPage {
  type: 'svg' | 'raster';
  data: string | Buffer;
  pageNumber: number;
}

export async function generateMultiPagePDF(images: string[]): Promise<Buffer> {
  console.log(`[PDF] Generating multi-page PDF with ${images.length} images`);
  
  const pageWidth = 612 - 2 * (0.5 * 72); // Letter width minus margins
  const pageHeight = 792 - 2 * (0.5 * 72); // Letter height minus margins

  // Precompute all page assets before creating the PDF (avoid async in pdfkit stream)
  console.log(`[PDF] Precomputing page assets...`);
  const preparedPages: PreparedPage[] = [];
  
  for (let i = 0; i < images.length; i++) {
    const imageBase64 = images[i];
    
    try {
      // Try to vectorize for crisp output
      const svg = await vectorizeImageFromBase64(imageBase64, {
        threshold: 128,
        turdSize: 2,
        optCurve: true,
        optTolerance: 0.2,
      });
      
      preparedPages.push({ type: 'svg', data: svg, pageNumber: i + 1 });
      console.log(`[PDF] Page ${i + 1} vectorized successfully`);
    } catch (vectorErr) {
      // Fallback to raster
      console.log(`[PDF] Vectorization failed for page ${i + 1}, using raster fallback`);
      const base64Data = imageBase64.includes("base64,")
        ? imageBase64.split("base64,")[1]
        : imageBase64;
      const imageBuffer = Buffer.from(base64Data, "base64");
      
      preparedPages.push({ type: 'raster', data: imageBuffer, pageNumber: i + 1 });
    }
  }
  
  console.log(`[PDF] All pages prepared, writing PDF...`);
  
  // Now create the PDF synchronously with all assets ready
  const doc = new PDFDocument({
    size: "Letter",
    margin: 0.5 * 72,
    autoFirstPage: false,
  });

  for (const page of preparedPages) {
    doc.addPage();
    
    if (page.type === 'svg') {
      // Original image is 1024x1536 (2:3 ratio)
      const imgAspectRatio = 1024 / 1536;
      let imgWidth = pageWidth;
      let imgHeight = imgWidth / imgAspectRatio;

      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth = imgHeight * imgAspectRatio;
      }

      // Center on page
      const xPos = (612 - imgWidth) / 2;
      const yPos = (792 - imgHeight) / 2;

      SVGtoPDF(doc, page.data as string, xPos, yPos, {
        width: imgWidth,
        height: imgHeight,
        preserveAspectRatio: "xMidYMid meet",
      });
    } else {
      doc.image(page.data as Buffer, 0.5 * 72, 0.5 * 72, {
        fit: [pageWidth, pageHeight],
        align: "center",
        valign: "center",
      });
    }
    
    // Add page number at bottom
    doc.fontSize(9).fillColor("#999999");
    const pageNumText = `Page ${page.pageNumber} of ${images.length}`;
    const pageNumWidth = doc.widthOfString(pageNumText);
    doc.text(pageNumText, (612 - pageNumWidth) / 2, 792 - 0.5 * 72 - 15, {
      lineBreak: false,
    });
  }

  // Collect chunks and return as buffer
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}
