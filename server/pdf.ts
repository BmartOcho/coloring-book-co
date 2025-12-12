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
