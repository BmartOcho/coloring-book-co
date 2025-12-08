import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import pRetry, { AbortError } from "p-retry";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
// Referenced from javascript_openai_ai_integrations blueprint
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// Helper function to check if error is rate limit or quota violation
function isRateLimitError(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return (
    errorMsg.includes("429") ||
    errorMsg.includes("RATELIMIT_EXCEEDED") ||
    errorMsg.toLowerCase().includes("quota") ||
    errorMsg.toLowerCase().includes("rate limit")
  );
}

export async function convertToColoringBook(
  imageBuffer: Buffer,
  fileName: string
): Promise<string> {
  return await pRetry(
    async () => {
      try {
        // Convert buffer to File object for OpenAI API
        const imageFile = await toFile(imageBuffer, fileName, {
          type: "image/png",
        });

        // Use gpt-image-1 model to convert photo to coloring book style
        // The prompt is carefully crafted to generate cartoon-style line art suitable for coloring
        const response = await openai.images.edit({
          model: "gpt-image-1",
          image: [imageFile],
          prompt: `Convert this photo into a clean, cartoon-style black and white line art drawing suitable for a children's coloring book. The output should have:
- Bold, clear outlines that are easy to color within
- Simple, cartoon-like stylization of all features
- High contrast black lines on white background
- Simplified details that maintain recognizability
- Kid-friendly aesthetic with smooth, rounded shapes
- No shading, gradients, or color fills - only clean line art
- Similar composition to the original photo`,
          background: "opaque",
          output_format: "png",
        });

        // Extract base64 image from response
        const imageBase64 = response.data?.[0]?.b64_json ?? "";
        
        if (!imageBase64) {
          throw new Error("No image data received from OpenAI");
        }

        return `data:image/png;base64,${imageBase64}`;
      } catch (error: any) {
        console.error("Error converting image:", error);
        
        // Check if it's a rate limit error
        if (isRateLimitError(error)) {
          throw error; // Rethrow to trigger p-retry
        }
        
        // For non-rate-limit errors, throw immediately (don't retry)
        throw new AbortError(error.message || "Failed to convert image to coloring book style");
      }
    },
    {
      retries: 7,
      minTimeout: 2000,
      maxTimeout: 128000,
      factor: 2,
    }
  );
}
