import { storage } from "./storage";
import { convertToColoringBook } from "./openai";
import { selectRandomPrompts, getAllPrompts } from "./prompts";
import { sendCompletionEmail } from "./email";
import { Buffer } from "node:buffer";
import {
  recordPromptFailure,
  isPromptBlocked,
  getBlockedPrompts,
  getPromptTrackingSummary,
} from "./prompt-tracker";

// p-queue is ESM-only, so we use dynamic import
let PQueueClass: any = null;

// Helper to load PQueue dynamically (handles ESM/CJS interop)
async function loadPQueue(): Promise<any> {
  if (PQueueClass) {
    return PQueueClass;
  }

  const pqModule = await import("p-queue");

  // Try different ways the export might be structured
  if (typeof pqModule.default === "function") {
    PQueueClass = pqModule.default;
  } else if (typeof pqModule.default?.default === "function") {
    PQueueClass = pqModule.default.default;
  } else if (typeof (pqModule as any).PQueue === "function") {
    PQueueClass = (pqModule as any).PQueue;
  } else if (typeof pqModule === "function") {
    PQueueClass = pqModule;
  } else {
    for (const key of Object.keys(pqModule)) {
      if (typeof (pqModule as any)[key] === "function") {
        console.log(`[p-queue] Found function at key: ${key}`);
        PQueueClass = (pqModule as any)[key];
        break;
      }
    }
  }

  if (!PQueueClass) {
    console.error(
      "[p-queue] Full module dump:",
      JSON.stringify(pqModule, null, 2),
    );
    throw new Error("Could not find PQueue constructor in p-queue module");
  }

  console.log("[p-queue] Loaded successfully");
  return PQueueClass;
}

// Background generation for full coloring books
// Generates 30 unique coloring pages based on the source image

// Parallel processing configuration
const CONCURRENT_GENERATIONS = 2;
const MAX_PROMPT_RETRIES = 5; // Max times to try alternative prompts for a single page

// Track active orders to prevent duplicate processing
const activeOrders = new Set<number>();

// Cache for prepared image buffers
const imageBufferCache = new Map<number, Buffer>();

// Check if an error is a moderation block
function isModerationError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  const errorCode = error?.code || "";
  return (
    errorCode === "moderation_blocked" ||
    errorMsg.includes("moderation_blocked") ||
    errorMsg.includes("rejected by the safety system") ||
    errorMsg.includes("content policy")
  );
}

async function generateSinglePage(
  sourceImageBuffer: Buffer,
  detailLevel: "1" | "2",
  scenePrompt: string,
): Promise<string> {
  const coloringImage = await convertToColoringBook(
    sourceImageBuffer,
    `page.png`,
    detailLevel,
    scenePrompt,
  );

  return coloringImage;
}

// Get available prompts (excluding blocked ones)
function getAvailablePrompts(): string[] {
  const allPrompts = getAllPrompts();
  const blockedPrompts = new Set(getBlockedPrompts());

  const available = allPrompts.filter((p) => !blockedPrompts.has(p));

  console.log(
    `[Prompts] ${available.length} available (${blockedPrompts.size} blocked)`,
  );

  return available;
}

// Select random prompts, excluding blocked ones and already-used ones
function selectAvailablePrompts(
  count: number,
  excludePrompts: Set<string> = new Set(),
): string[] {
  const available = getAvailablePrompts().filter((p) => !excludePrompts.has(p));
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Prepare and cache image buffer for reuse across all pages
function getImageBuffer(orderId: number, sourceImageBase64: string): Buffer {
  const cached = imageBufferCache.get(orderId);
  if (cached) {
    return cached;
  }

  const base64Data = sourceImageBase64.includes("base64,")
    ? sourceImageBase64.split("base64,")[1]
    : sourceImageBase64;

  const imageBuffer = Buffer.from(base64Data, "base64");
  imageBufferCache.set(orderId, imageBuffer);

  return imageBuffer;
}

export async function startBackgroundGeneration(
  orderId: number,
  resumeFromPage: number = 1,
  baseUrl?: string,
): Promise<void> {
  // Load PQueue dynamically for ESM compatibility
  const PQueue = await loadPQueue();

  console.log(
    `[Order ${orderId}] startBackgroundGeneration called with resumeFromPage=${resumeFromPage}, baseUrl=${baseUrl}`,
  );

  // Log prompt tracking summary at start
  const trackingSummary = getPromptTrackingSummary();
  console.log(
    `[Order ${orderId}] Prompt status: ${trackingSummary.blocked} blocked, ${trackingSummary.warning} warning, ${trackingSummary.total} tracked`,
  );

  // Prevent duplicate processing
  if (activeOrders.has(orderId)) {
    console.log(`[Order ${orderId}] Already being processed, skipping`);
    return;
  }
  activeOrders.add(orderId);
  console.log(
    `[Order ${orderId}] Added to active orders, starting generation...`,
  );

  const startTime = Date.now();
  const isResume = resumeFromPage > 1;

  // Create a dedicated queue for this order
  const orderQueue = new PQueue({
    concurrency: CONCURRENT_GENERATIONS,
    intervalCap: 4,
    interval: 60000,
  });

  // Track which prompts we've used or tried (to avoid repeats)
  const usedPrompts = new Set<string>();

  try {
    console.log(
      `[Order ${orderId}] ${isResume ? `Resuming from page ${resumeFromPage}` : "Starting background generation"}...`,
    );

    const order = await storage.getOrder(orderId);
    if (!order) {
      console.error(`[Order ${orderId}] Order not found in database`);
      activeOrders.delete(orderId);
      return;
    }

    if (!isResume) {
      console.log(
        `[Order ${orderId}] Order found, setting status to generating`,
      );
      await storage.updateOrderStatus(orderId, "generating");
    } else {
      console.log(
        `[Order ${orderId}] Resuming - already has ${order.generatedImages.length} images`,
      );
    }

    const detailLevel = (order.detailLevel === "2" ? "2" : "1") as "1" | "2";
    const sourceImageBuffer = getImageBuffer(orderId, order.sourceImage);

    // Initialize results array with existing images
    const pageResults: (string | null)[] = new Array(order.totalPages).fill(
      null,
    );

    const existingImages = order.generatedImages || [];
    for (let i = 0; i < existingImages.length; i++) {
      pageResults[i] = existingImages[i];
    }

    if (existingImages.length === 0) {
      pageResults[0] = order.initialColoringImage;
    }

    let successCount = Math.max(existingImages.length, 1);
    const pagesNeeded = order.totalPages - successCount;

    if (pagesNeeded <= 0) {
      console.log(
        `[Order ${orderId}] All pages already generated, marking complete`,
      );
      imageBufferCache.delete(orderId);
      activeOrders.delete(orderId);
      await storage.updateOrderStatus(orderId, "completed", new Date());
      return;
    }

    // Select initial prompts (excluding blocked ones)
    const initialPrompts = selectAvailablePrompts(pagesNeeded);
    initialPrompts.forEach((p) => usedPrompts.add(p));

    console.log(
      `[Order ${orderId}] Starting generation of ${pagesNeeded} pages (${successCount} already done)`,
    );
    console.log(
      `[Order ${orderId}] Detail level: ${detailLevel === "1" ? "Simple" : "Complex"}`,
    );
    console.log(
      `[Order ${orderId}] Parallel mode: ${CONCURRENT_GENERATIONS} concurrent, 4/min rate limit`,
    );

    // Build page generation tasks
    const pageTasks: {
      pageNumber: number;
      arrayIndex: number;
      scenePrompt: string;
    }[] = [];
    let promptIndex = 0;
    for (let i = 0; i < order.totalPages; i++) {
      if (pageResults[i] === null && promptIndex < initialPrompts.length) {
        pageTasks.push({
          pageNumber: i + 1,
          arrayIndex: i,
          scenePrompt: initialPrompts[promptIndex],
        });
        promptIndex++;
      }
    }

    // Track overall generation status
    let totalFailures = 0;
    const MAX_TOTAL_FAILURES = 50; // Give up if we have too many failures overall

    // Generate a single page with retry logic for moderation errors
    const generatePageWithRetry = async (
      pageNumber: number,
      arrayIndex: number,
      initialPrompt: string,
    ): Promise<{ success: boolean; prompt?: string }> => {
      let currentPrompt = initialPrompt;
      let attempts = 0;

      while (attempts < MAX_PROMPT_RETRIES) {
        attempts++;

        // Skip if prompt is blocked
        if (isPromptBlocked(currentPrompt)) {
          console.log(
            `[Order ${orderId}] Page ${pageNumber}: Prompt blocked, getting alternative`,
          );
          const alternatives = selectAvailablePrompts(1, usedPrompts);
          if (alternatives.length === 0) {
            console.error(
              `[Order ${orderId}] Page ${pageNumber}: No more available prompts!`,
            );
            return { success: false };
          }
          currentPrompt = alternatives[0];
          usedPrompts.add(currentPrompt);
          continue;
        }

        try {
          console.log(
            `[Order ${orderId}] Page ${pageNumber} attempt ${attempts}: "${currentPrompt.substring(0, 50)}..."`,
          );

          const pageImage = await generateSinglePage(
            sourceImageBuffer,
            detailLevel,
            currentPrompt,
          );

          // Success!
          pageResults[arrayIndex] = pageImage;
          successCount++;

          // Update progress
          let contiguousCount = 0;
          for (let i = 0; i < pageResults.length; i++) {
            if (pageResults[i] !== null) {
              contiguousCount++;
            } else {
              break;
            }
          }

          const contiguousImages = pageResults
            .slice(0, contiguousCount)
            .filter((img): img is string => img !== null);
          await storage.updateOrderProgress(
            orderId,
            successCount,
            contiguousImages,
          );

          console.log(
            `[Order ${orderId}] Page ${pageNumber} complete (${successCount}/${order.totalPages} total)`,
          );

          return { success: true, prompt: currentPrompt };
        } catch (error: any) {
          const errorMessage = error?.message || String(error);

          if (isModerationError(error)) {
            // Record the failure for this prompt
            const failureCount = recordPromptFailure(
              currentPrompt,
              errorMessage,
            );
            console.log(
              `[Order ${orderId}] Page ${pageNumber}: Moderation blocked for "${currentPrompt.substring(0, 40)}..." (failure #${failureCount})`,
            );

            // Get an alternative prompt
            const alternatives = selectAvailablePrompts(1, usedPrompts);
            if (alternatives.length === 0) {
              console.error(
                `[Order ${orderId}] Page ${pageNumber}: No more available prompts after moderation block!`,
              );
              totalFailures++;
              return { success: false };
            }

            currentPrompt = alternatives[0];
            usedPrompts.add(currentPrompt);
            console.log(
              `[Order ${orderId}] Page ${pageNumber}: Trying alternative prompt: "${currentPrompt.substring(0, 40)}..."`,
            );
          } else {
            // Non-moderation error - this is more serious
            console.error(
              `[Order ${orderId}] Page ${pageNumber}: Non-moderation error:`,
              errorMessage,
            );
            totalFailures++;

            // For non-moderation errors, we might want to retry the same prompt
            // (could be a transient API issue)
            if (attempts >= MAX_PROMPT_RETRIES) {
              return { success: false };
            }

            // Wait a bit before retrying on transient errors
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        }
      }

      console.error(
        `[Order ${orderId}] Page ${pageNumber}: Exhausted all ${MAX_PROMPT_RETRIES} retry attempts`,
      );
      totalFailures++;
      return { success: false };
    };

    // Process all pages with the queue
    const pagePromises = pageTasks.map((task) => {
      return orderQueue.add(async () => {
        // Check if we've had too many failures overall
        if (totalFailures >= MAX_TOTAL_FAILURES) {
          console.log(
            `[Order ${orderId}] Page ${task.pageNumber}: Skipping due to too many total failures`,
          );
          return { pageNumber: task.pageNumber, success: false, skipped: true };
        }

        const result = await generatePageWithRetry(
          task.pageNumber,
          task.arrayIndex,
          task.scenePrompt,
        );
        return { pageNumber: task.pageNumber, ...result };
      });
    });

    // Wait for all pages to complete
    await Promise.all(pagePromises);

    // Wait for queue to fully drain
    await orderQueue.onIdle();

    // Check final results
    const finalImages = pageResults.filter(
      (img): img is string => img !== null,
    );

    if (finalImages.length < order.totalPages) {
      console.error(
        `[Order ${orderId}] Only generated ${finalImages.length}/${order.totalPages} pages - marking as failed`,
      );
      console.error(`[Order ${orderId}] Total failures: ${totalFailures}`);
      imageBufferCache.delete(orderId);
      activeOrders.delete(orderId);
      await storage.updateOrderStatus(orderId, "failed");
      return;
    }

    // Success! All pages generated
    await storage.updateOrderProgress(orderId, order.totalPages, finalImages);
    imageBufferCache.delete(orderId);
    activeOrders.delete(orderId);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    await storage.updateOrderStatus(orderId, "completed", new Date());
    console.log(
      `[Order ${orderId}] Completed with ${finalImages.length} pages in ${elapsed}s`,
    );

    // Send completion email
    if (order.email && baseUrl) {
      const progressUrl = `${baseUrl}/progress/${orderId}`;
      try {
        await sendCompletionEmail(order.email, orderId, progressUrl);
        console.log(
          `[Order ${orderId}] Completion email sent to ${order.email}`,
        );
      } catch (emailError) {
        console.error(
          `[Order ${orderId}] Failed to send completion email:`,
          emailError,
        );
      }
    }
  } catch (error) {
    console.error(`[Order ${orderId}] Background generation failed:`, error);
    imageBufferCache.delete(orderId);
    activeOrders.delete(orderId);
    await storage.updateOrderStatus(orderId, "failed");
  }
}

// Check for and resume any interrupted orders on server startup
export async function checkAndResumeOrders(): Promise<void> {
  // Pre-load PQueue
  await loadPQueue();

  // Log prompt tracking status at startup
  const trackingSummary = getPromptTrackingSummary();
  console.log(
    `[Resume] Prompt tracking: ${trackingSummary.total} prompts tracked, ${trackingSummary.blocked} blocked`,
  );
  if (trackingSummary.blocked > 0) {
    console.log(`[Resume] Blocked prompts:`);
    trackingSummary.prompts
      .filter((p) => p.blocked)
      .forEach((p) =>
        console.log(
          `  - "${p.prompt.substring(0, 50)}..." (${p.count} failures)`,
        ),
      );
  }

  try {
    const ordersToResume = await storage.getOrdersToResume();

    if (ordersToResume.length === 0) {
      console.log("[Resume] No interrupted orders to resume");
      return;
    }

    console.log(`[Resume] Found ${ordersToResume.length} order(s) to resume`);

    let baseUrl = process.env.DEPLOYMENT_URL;

    if (!baseUrl) {
      const replSlug = process.env.REPL_SLUG;
      const replOwner = process.env.REPL_OWNER;

      if (process.env.REPLIT_DEPLOYMENT && replSlug) {
        baseUrl = `https://${replSlug}.replit.app`;
      } else if (replSlug && replOwner) {
        baseUrl = `https://${replSlug}.${replOwner}.repl.co`;
      } else {
        baseUrl = `http://localhost:${process.env.PORT || 5000}`;
      }
    }

    console.log(`[Resume] Using base URL for emails: ${baseUrl}`);

    for (const order of ordersToResume) {
      const completedPages = order.generatedImages?.length || 1;
      const statusInfo = order.status === "pending" ? " (was pending)" : "";
      console.log(
        `[Resume] Resuming order ${order.id} from page ${completedPages + 1}${statusInfo}`,
      );

      if (order.status === "pending") {
        await storage.updateOrderStatus(order.id, "generating");
      }

      startBackgroundGeneration(order.id, completedPages + 1, baseUrl).catch(
        (err) => {
          console.error(`[Resume] Failed to resume order ${order.id}:`, err);
        },
      );
    }
  } catch (error) {
    console.error("[Resume] Error checking for orders to resume:", error);
  }
}
