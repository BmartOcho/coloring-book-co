import { GoogleGenAI } from "@google/genai";
import { Buffer } from "node:buffer";
import pRetry, { AbortError } from "p-retry";

// Initialize Gemini API client
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
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
  scenePrompt?: string,
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

        const imageBase64 = imageBuffer.toString("base64");

        let prompt = "";
        
        if (scenePrompt) {
          // Scene-based generation for coloring book pages
          if (detailLevel === "1") {
            prompt = `Convert the subject from this photo into a clean, Disney-Pixar-style black and white line art coloring book page. Show the subject ${scenePrompt}. The output should have: Bold, clear outlines that are easy to color within. Disney-Pixar-like stylization. High contrast black lines on white background. Kid-friendly aesthetic with smooth, rounded shapes. No shading, gradients, or color fills - only clean line art.`;
          } else {
            prompt = `Convert the subject from this photo into a clean, Disney-Pixar-style black and white line art coloring book page. Show the subject ${scenePrompt}. The output should have: More complex and detailed line work. Refined features and textures. Increased decorative elements and pattern details. High contrast black lines on white background. Thinner lines throughout. No shading, gradients, or color fills - only clean line art.`;
          }
        } else {
          // Original image conversion (no scene)
          if (detailLevel === "1") {
            prompt =
              "Convert this photo into a clean, Disney-Pixar-style black and white line art drawing suitable for a children's coloring book. The output should have: Bold, clear outlines that are easy to color within. Disney-Pixar-like stylization of all features. High contrast black lines on white background. Accurate details that maintain recognizability. Kid-friendly aesthetic with smooth, rounded shapes. No shading, gradients, or color fills - only clean line art. Keep composition true to the original.";
          } else {
            prompt =
              "Convert this photo into a clean, Disney-Pixar-style black and white line art drawing suitable for a children's coloring book. The output should have: More complex and detailed line work than simple style. Refined features and textures. Increased decorative elements and pattern details. High contrast black lines on white background. Thinner lines throughout than simple style. No shading, gradients, or color fills - only clean line art. Keep composition true to the original.";
          }
        }

        prompt += " No shading, gradients, or color fills - only clean line art.";

        // Use Nano Banana Pro (gemini-3-pro-image-preview)
        // See: https://ai.google.dev/gemini-api/docs/nanobanana
        const response = await genAI.models.generateContent({
          model: "gemini-3-pro-image-preview",
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: imageBase64,
              },
            },
          ],
          config: {
            responseModalities: ["IMAGE"],
          }
        });

        console.log("Gemini generateContent response received");

        const generatedImageBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (!generatedImageBase64) {
          console.error(
            "No image result in response:",
            JSON.stringify(response, null, 2),
          );
          throw new Error("No image data received from Gemini");
        }

        return "data:image/png;base64," + generatedImageBase64;
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
