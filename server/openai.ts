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

        const prompt =
          "Convert this photo into a clean, Disney-Pixar-style black and white line art drawing suitable for a children's coloring book. The output should have: Bold, clear outlines that are easy to color within. Disney-Pixar-like stylization of all features. High contrast black lines on white background. Accurate details that maintain recognizability. Kid-friendly aesthetic with smooth, rounded shapes. No shading, gradients, or color fills - only clean line art. Keep composition true to the original.";

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
