import type { Express } from "express";
import { createServer, type Server } from "http";
import { imageConversionRequestSchema } from "@shared/schema";
import { convertToColoringBook } from "./openai";
import { Buffer } from "node:buffer";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Image conversion endpoint
  app.post("/api/convert", async (req, res) => {
    try {
      const validationResult = imageConversionRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: validationResult.error.errors 
        });
      }

      const { imageData, fileName } = validationResult.data;
      const imageBuffer = Buffer.from(imageData, "base64");

      if (imageBuffer.length > 50 * 1024 * 1024) {
        return res.status(400).json({ 
          error: "Image too large. Maximum size is 50MB." 
        });
      }

      const coloringBookImage = await convertToColoringBook(imageBuffer, fileName);

      res.json({
        originalImage: "data:image/png;base64," + imageData,
        coloringBookImage,
        fileName: "coloring-book-" + fileName,
      });
    } catch (error: any) {
      console.error("Conversion error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to convert image" 
      });
    }
  });

  return httpServer;
}
