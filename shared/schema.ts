import { z } from "zod";

// Schema for image conversion request
export const imageConversionRequestSchema = z.object({
  imageData: z.string(), // base64 encoded image
  fileName: z.string(),
  detailLevel: z.enum(["1", "2", "3"]).default("1"), // 1=simple, 2=medium, 3=complex
});

export type ImageConversionRequest = z.infer<typeof imageConversionRequestSchema>;

// Schema for image conversion response
export const imageConversionResponseSchema = z.object({
  originalImage: z.string(), // base64 encoded
  coloringBookImage: z.string(), // base64 encoded
  fileName: z.string(),
});

export type ImageConversionResponse = z.infer<typeof imageConversionResponseSchema>;
