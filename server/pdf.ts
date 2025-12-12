import PDFDocument from "pdfkit";
import { Buffer } from "node:buffer";

export function generateColoringBookPDF(imageBase64: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      // 8.5 x 11 inches at 72 DPI
      const doc = new PDFDocument({
        size: "Letter",
        margin: 0.5 * 72, // 0.5 inch margins
      });

      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Remove the "data:image/png;base64," prefix if present
      const base64Data = imageBase64.includes("base64,")
        ? imageBase64.split("base64,")[1]
        : imageBase64;

      const imageBuffer = Buffer.from(base64Data, "base64");

      // Calculate dimensions to fit on page while maintaining aspect ratio
      // Image is 1024x1536 (2:3 ratio)
      const pageWidth = doc.page.width - 2 * (0.5 * 72);
      const pageHeight = doc.page.height - 2 * (0.5 * 72);
      const maxWidth = pageWidth;
      const maxHeight = pageHeight;

      // Image is 2:3 aspect ratio (1024:1536)
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

      doc.image(imageBuffer, xPos, yPos, {
        width: imgWidth,
        height: imgHeight,
      });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
