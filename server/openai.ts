import OpenAI, { toFile } from "openai";
import { Buffer } from "node:buffer";
import pRetry, { AbortError } from "p-retry";

const client = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

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
  fileName: string,
  detailLevel: "1" | "2" | "3" = "1",
): Promise<string> {
  return await pRetry(
    async () => {
      try {
        const ext = fileName.toLowerCase().split(".").pop();
        let mimeType = "image/png";
        if (ext === "jpg" || ext === "jpeg") {
          mimeType = "image/jpeg";
        } else if (ext === "webp") {
          mimeType = "image/webp";
        }

        const imageFile = await toFile(imageBuffer, fileName, {
          type: mimeType,
        });

        let prompt = "";
        
        if (detailLevel === "1") {
          prompt =
            "Convert this photo into a clean, Disney-Pixar-style black and white line art drawing suitable for young children's coloring book. The output should have: BOLD, THICK, CLEAR outlines that are easy to color within. Simple, smooth shapes and forms. Disney-Pixar-like stylization with minimal details. High contrast black lines on white background. Kid-friendly aesthetic with rounded shapes. No shading, gradients, or color fills - only clean, simple line art. Keep composition true to the original. Focus on simplicity and ease of coloring.";
        } else if (detailLevel === "2") {
          prompt =
            "Convert this photo into a moderately detailed black and white line art drawing suitable for older children's coloring book. The output should have: Medium thickness black lines with added complexity and details. More refined features and textures than simple style. Increased decorative elements and pattern details. High contrast black lines on white background. Artistic but still accessible for intermediate colorers. Thin to medium line weights throughout. Use only clean line art with decorative line patterns - NO shading, NO cross-hatching, NO stippling, NO gradients, NO fills. Keep composition true to the original.";
        } else {
          // detailLevel === "3"
          prompt =
            "Convert this photo into a highly detailed, intricate black and white line art drawing suitable for adult coloring books. The output should have: VERY THIN, DELICATE lines with exceptional detail and complexity. Intricate textures, patterns, and fine details throughout created ONLY with line work and patterns. High contrast black lines on white background. Sophisticated artistic style with intricate embellishments and decorative line patterns. Most lines should be thin and delicate. NO solid shading, NO cross-hatching, NO stippling, NO gradients, NO color fills - only expert-level line art and decorative patterns. Maintain all details from the original. Create an intricate, detailed composition.";
        }

        prompt += " Absolutely no shading, gradients, or color fills - only clean line art.";

        const response = await client.images.edit({
          model: "gpt-image-1",
          image: imageFile,
          prompt: prompt,
          background: "opaque",
          output_format: "png",
          quality: "high",
          size: "1024x1536",
        });

        console.log("OpenAI images.edit response received");

        const imageBase64 = response.data?.[0]?.b64_json;

        if (!imageBase64) {
          console.error(
            "No image result in response:",
            JSON.stringify(response, null, 2),
          );
          throw new Error("No image data received from OpenAI");
        }

        return "data:image/png;base64," + imageBase64;
      } catch (error: any) {
        console.error("Error converting image:", error);

        if (isRateLimitError(error)) {
          throw error;
        }

        throw new AbortError(
          error.message || "Failed to convert image to coloring book style",
        );
      }
    },
    {
      retries: 7,
      minTimeout: 2000,
      maxTimeout: 128000,
      factor: 2,
    },
  );
}
