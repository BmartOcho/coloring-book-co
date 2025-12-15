import { storage } from "./storage";
import { convertToColoringBook } from "./openai";
import { selectRandomPrompts } from "./prompts";
import { Buffer } from "node:buffer";

// Background generation for full coloring books
// Generates 30 unique coloring pages based on the source image

async function generateSinglePage(
  sourceImageBase64: string,
  detailLevel: "1" | "2",
  scenePrompt: string
): Promise<string> {
  // Remove data URL prefix if present
  const base64Data = sourceImageBase64.includes("base64,")
    ? sourceImageBase64.split("base64,")[1]
    : sourceImageBase64;

  const imageBuffer = Buffer.from(base64Data, "base64");

  const coloringImage = await convertToColoringBook(
    imageBuffer,
    `page.png`,
    detailLevel,
    scenePrompt
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

    // Get the detail level from the order (default to "1" if not set)
    const detailLevel = (order.detailLevel === "2" ? "2" : "1") as "1" | "2";

    // Select 29 random unique prompts for the remaining pages
    const scenePrompts = selectRandomPrompts(order.totalPages - 1);

    console.log(`Starting generation of ${order.totalPages - 1} additional pages for order ${orderId}`);
    console.log(`Using detail level: ${detailLevel === "1" ? "Simple" : "Complex"}`);

    // Generate remaining pages (first page is the initial conversion)
    for (let i = 0; i < scenePrompts.length; i++) {
      const pageNumber = i + 2; // Pages are 1-indexed, first page already generated
      const scenePrompt = scenePrompts[i];

      try {
        console.log(`Generating page ${pageNumber}/${order.totalPages} for order ${orderId}: "${scenePrompt}"`);

        const pageImage = await generateSinglePage(
          order.sourceImage,
          detailLevel,
          scenePrompt
        );
        generatedImages.push(pageImage);

        await storage.updateOrderProgress(orderId, pageNumber, generatedImages);

        // Small delay between generations to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error generating page ${pageNumber} for order ${orderId}:`, error);
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
