import { storage } from "./storage";
import { convertToColoringBook } from "./openai";
import { selectRandomPrompts } from "./prompts";
import { Buffer } from "node:buffer";
import PQueue from "p-queue";

// Background generation for full coloring books
// Generates 30 unique coloring pages based on the source image

// Parallel processing configuration
// OpenAI image edit typically allows ~5 requests/minute
// We use 2 concurrent with 4/min rate limit for safety
const CONCURRENT_GENERATIONS = 2;

// Cache for prepared image buffers (avoid re-decoding base64 for each page)
const imageBufferCache = new Map<number, Buffer>();

async function generateSinglePage(
  sourceImageBuffer: Buffer,
  detailLevel: "1" | "2",
  scenePrompt: string
): Promise<string> {
  const coloringImage = await convertToColoringBook(
    sourceImageBuffer,
    `page.png`,
    detailLevel,
    scenePrompt
  );

  return coloringImage;
}

// Prepare and cache image buffer for reuse across all pages
function getImageBuffer(orderId: number, sourceImageBase64: string): Buffer {
  const cached = imageBufferCache.get(orderId);
  if (cached) {
    return cached;
  }

  // Remove data URL prefix if present
  const base64Data = sourceImageBase64.includes("base64,")
    ? sourceImageBase64.split("base64,")[1]
    : sourceImageBase64;

  const imageBuffer = Buffer.from(base64Data, "base64");
  imageBufferCache.set(orderId, imageBuffer);
  
  return imageBuffer;
}

export async function startBackgroundGeneration(orderId: number): Promise<void> {
  const startTime = Date.now();
  
  // Create a dedicated queue for this order (allows cleanup/cancellation)
  const orderQueue = new PQueue({ 
    concurrency: CONCURRENT_GENERATIONS,
    intervalCap: 4,
    interval: 60000, // Per minute rate limit
  });
  
  // Flag to stop processing on failure
  let hasFailed = false;
  
  try {
    console.log(`[Order ${orderId}] Starting background generation...`);
    
    const order = await storage.getOrder(orderId);
    if (!order) {
      console.error(`[Order ${orderId}] Order not found in database`);
      return;
    }

    console.log(`[Order ${orderId}] Order found, setting status to generating`);
    await storage.updateOrderStatus(orderId, "generating");

    // Get the detail level from the order (default to "1" if not set)
    const detailLevel = (order.detailLevel === "2" ? "2" : "1") as "1" | "2";

    // Select 29 random unique prompts for the remaining pages
    const scenePrompts = selectRandomPrompts(order.totalPages - 1);

    console.log(`[Order ${orderId}] Starting generation of ${order.totalPages - 1} additional pages`);
    console.log(`[Order ${orderId}] Detail level: ${detailLevel === "1" ? "Simple" : "Complex"}`);
    console.log(`[Order ${orderId}] Parallel mode: ${CONCURRENT_GENERATIONS} concurrent, 4/min rate limit`);

    // Pre-cache the image buffer
    const sourceImageBuffer = getImageBuffer(orderId, order.sourceImage);

    // Initialize results array with slots for all pages
    // Index 0 = page 1 (initial), Index 1 = page 2, etc.
    const pageResults: (string | null)[] = new Array(order.totalPages).fill(null);
    pageResults[0] = order.initialColoringImage; // First page already done
    
    // Track progress
    let successCount = 1; // First page already done
    let failCount = 0;
    
    // Initial progress update - first page is already done
    await storage.updateOrderProgress(orderId, 1, [order.initialColoringImage]);

    // Build all page generation tasks
    const pageTasks = scenePrompts.map((scenePrompt, i) => ({
      pageNumber: i + 2, // Pages are 1-indexed, first page already generated
      arrayIndex: i + 1, // Array index for this page
      scenePrompt,
    }));

    // Generate pages in parallel using p-queue
    const generatePageTask = async (task: typeof pageTasks[0]) => {
      // Short-circuit if already failed
      if (hasFailed) {
        console.log(`Skipping page ${task.pageNumber} - order already failed`);
        return { pageNumber: task.pageNumber, success: false, skipped: true };
      }
      
      try {
        console.log(`Generating page ${task.pageNumber}/${order.totalPages} for order ${orderId}: "${task.scenePrompt}"`);

        const pageImage = await generateSinglePage(
          sourceImageBuffer,
          detailLevel,
          task.scenePrompt
        );
        
        // Store result in the correct slot
        pageResults[task.arrayIndex] = pageImage;
        successCount++;
        
        // Count contiguous pages from the start (for ordered images in DB)
        let contiguousCount = 0;
        for (let i = 0; i < pageResults.length; i++) {
          if (pageResults[i] !== null) {
            contiguousCount++;
          } else {
            break;
          }
        }
        
        // Store only contiguous images in correct order, but report successCount for progress %
        const contiguousImages = pageResults.slice(0, contiguousCount).filter((img): img is string => img !== null);
        
        // Use successCount for progress percentage display (actual completed count)
        // Store contiguous images for proper PDF ordering
        await storage.updateOrderProgress(orderId, successCount, contiguousImages);
        
        console.log(`[Order ${orderId}] Page ${task.pageNumber} complete (${successCount}/${order.totalPages} total, ${contiguousCount} contiguous)`);
        
        return { pageNumber: task.pageNumber, success: true };
      } catch (error) {
        console.error(`Error generating page ${task.pageNumber} for order ${orderId}:`, error);
        failCount++;
        hasFailed = true;
        
        // Clear the queue to stop processing more pages
        orderQueue.clear();
        
        return { pageNumber: task.pageNumber, success: false, error };
      }
    };

    // Add all tasks to the queue and wait for queue to become idle
    // Using onIdle() instead of Promise.all to handle queue.clear() properly
    pageTasks.forEach(task => {
      orderQueue.add(() => generatePageTask(task)).catch(() => {
        // Errors are already handled in generatePageTask, this catch prevents unhandled rejections
      });
    });
    
    // Wait for the queue to finish (handles both success and cleared cases)
    await orderQueue.onIdle();

    // Check if any pages failed
    if (hasFailed || failCount > 0) {
      console.error(`Order ${orderId}: ${failCount} pages failed to generate - marking as failed`);
      imageBufferCache.delete(orderId);
      await storage.updateOrderStatus(orderId, "failed");
      return;
    }

    // Build final ordered array of images (filter out any nulls)
    const finalImages = pageResults.filter((img): img is string => img !== null);
    
    // Verify we have all pages
    if (finalImages.length !== order.totalPages) {
      console.error(`Order ${orderId}: Expected ${order.totalPages} pages but got ${finalImages.length} - marking as failed`);
      imageBufferCache.delete(orderId);
      await storage.updateOrderStatus(orderId, "failed");
      return;
    }

    // Final progress update with complete ordered array
    await storage.updateOrderProgress(orderId, order.totalPages, finalImages);

    // Clean up cache
    imageBufferCache.delete(orderId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await storage.updateOrderStatus(orderId, "completed", new Date());
    console.log(`Order ${orderId} completed with ${finalImages.length} pages in ${elapsed}s`);
  } catch (error) {
    console.error(`Background generation failed for order ${orderId}:`, error);
    imageBufferCache.delete(orderId);
    orderQueue.clear();
    await storage.updateOrderStatus(orderId, "failed");
  }
}
