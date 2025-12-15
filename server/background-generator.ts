import { storage } from "./storage";
import { convertToColoringBook } from "./openai";
import { Buffer } from "node:buffer";

// Background generation for full coloring books
// Generates 25 unique coloring pages based on the source image

async function generateSinglePage(
  sourceImageBase64: string,
  pageNumber: number,
  totalPages: number
): Promise<string> {
  // Remove data URL prefix if present
  const base64Data = sourceImageBase64.includes("base64,")
    ? sourceImageBase64.split("base64,")[1]
    : sourceImageBase64;

  const imageBuffer = Buffer.from(base64Data, "base64");

  // Vary the detail level for variety
  const detailLevel = pageNumber % 2 === 0 ? "1" : "2";

  const coloringImage = await convertToColoringBook(
    imageBuffer,
    `page-${pageNumber}.png`,
    detailLevel
  );

  return coloringImage;
}

export async function startBackgroundGeneration(orderId: number): Promise<void> {
  try {
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.error(`Order ${orderId} not found`);
      return;
    }

    await storage.updateOrderStatus(orderId, "generating");

    const generatedImages: string[] = [order.initialColoringImage];
    await storage.updateOrderProgress(orderId, 1, generatedImages);

    // Generate remaining 24 pages (first page is the initial conversion)
    for (let i = 2; i <= order.totalPages; i++) {
      try {
        console.log(`Generating page ${i}/${order.totalPages} for order ${orderId}`);

        const pageImage = await generateSinglePage(order.sourceImage, i, order.totalPages);
        generatedImages.push(pageImage);

        await storage.updateOrderProgress(orderId, i, generatedImages);

        // Small delay between generations to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error generating page ${i} for order ${orderId}:`, error);
        // Continue with next page even if one fails
      }
    }

    await storage.updateOrderStatus(orderId, "completed", new Date());
    console.log(`Order ${orderId} completed with ${generatedImages.length} pages`);
  } catch (error) {
    console.error(`Background generation failed for order ${orderId}:`, error);
    await storage.updateOrderStatus(orderId, "failed");
  }
}
