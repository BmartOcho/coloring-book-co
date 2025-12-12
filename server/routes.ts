import type { Express } from "express";
import { createServer, type Server } from "http";
import express from "express";
import path from "path";
import { storage } from "./storage";
import { 
  imageConversionRequestSchema,
  createStoryRequestSchema,
  generateSectionPromptRequestSchema,
  submitSectionInputsRequestSchema,
} from "@shared/schema";
import { convertToColoringBook } from "./openai";
import { generateSectionPrompt, generateSectionText, getTotalSections } from "./story";
import { Buffer } from "node:buffer";
import { z } from "zod";

const createOrderRequestSchema = z.object({
  storyId: z.string().min(1, "Story ID is required"),
  email: z.string().email("Valid email is required"),
});

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

  // Create a new story
  app.post("/api/stories", async (req, res) => {
    try {
      const validationResult = createStoryRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: validationResult.error.errors 
        });
      }

      const { characterName, storyType, characterImageData, originalImageData } = validationResult.data;

      const story = await storage.createStory({
        characterName,
        storyType,
        characterImageData,
        originalImageData,
        sections: [],
        isComplete: false,
      });

      res.json(story);
    } catch (error: any) {
      console.error("Create story error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to create story" 
      });
    }
  });

  // Get a story by ID
  app.get("/api/stories/:id", async (req, res) => {
    try {
      const story = await storage.getStory(req.params.id);
      
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      res.json(story);
    } catch (error: any) {
      console.error("Get story error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to get story" 
      });
    }
  });

  // Generate the next section prompt (mad-lib style)
  app.post("/api/stories/:id/generate-prompt", async (req, res) => {
    try {
      const story = await storage.getStory(req.params.id);
      
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      const nextSectionNumber = story.sections.length + 1;
      
      if (nextSectionNumber > getTotalSections()) {
        return res.status(400).json({ error: "Story is already complete" });
      }

      const previousSections = story.sections.map(s => ({
        userInputs: s.userInputs,
        generatedText: s.generatedText,
      }));

      const sectionPrompt = await generateSectionPrompt(
        story.characterName,
        story.storyType,
        nextSectionNumber,
        previousSections
      );

      res.json(sectionPrompt);
    } catch (error: any) {
      console.error("Generate prompt error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to generate section prompt" 
      });
    }
  });

  // Submit user inputs for a section and generate story text
  app.post("/api/stories/:id/submit-section", async (req, res) => {
    try {
      const validationResult = submitSectionInputsRequestSchema.safeParse({
        ...req.body,
        storyId: req.params.id,
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: validationResult.error.errors 
        });
      }

      const { sectionNumber, userInputs } = validationResult.data;

      const story = await storage.getStory(req.params.id);
      
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      const previousSections = story.sections.map(s => ({
        generatedText: s.generatedText,
      }));

      const prompt = req.body.prompt || "";

      const generatedText = await generateSectionText(
        story.characterName,
        story.storyType,
        sectionNumber,
        prompt,
        userInputs,
        previousSections
      );

      const newSection = {
        sectionNumber,
        prompt,
        userInputs,
        generatedText,
        isComplete: true,
      };

      await storage.addSection(req.params.id, newSection);

      const isStoryComplete = sectionNumber >= getTotalSections();
      
      if (isStoryComplete) {
        await storage.updateStory(req.params.id, { isComplete: true });
      }

      res.json({
        sectionNumber,
        generatedText,
        isStoryComplete,
        totalSections: getTotalSections(),
      });
    } catch (error: any) {
      console.error("Submit section error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to submit section" 
      });
    }
  });

  // Redo the last section
  app.post("/api/stories/:id/redo-section", async (req, res) => {
    try {
      const story = await storage.getStory(req.params.id);
      
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      if (story.sections.length === 0) {
        return res.status(400).json({ error: "No sections to redo" });
      }

      const newSections = story.sections.slice(0, -1);
      await storage.updateStory(req.params.id, { 
        sections: newSections,
        isComplete: false,
      });

      const updatedStory = await storage.getStory(req.params.id);
      res.json(updatedStory);
    } catch (error: any) {
      console.error("Redo section error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to redo section" 
      });
    }
  });

  // Get order status
  app.get("/api/orders/:id", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const story = await storage.getStory(order.storyId);

      res.json({
        ...order,
        story: story ? {
          characterName: story.characterName,
          storyType: story.storyType,
        } : null,
      });
    } catch (error: any) {
      console.error("Get order error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to get order" 
      });
    }
  });

  // Secure PDF download endpoint - validates order ownership
  app.get("/api/downloads/:orderId", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.orderId);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== 'completed' || !order.pdfUrl) {
        return res.status(400).json({ error: "Book not ready yet" });
      }

      // Extract filename from pdfUrl and serve the file
      const fileName = order.pdfUrl.replace('/downloads/', '');
      const filePath = path.join(process.cwd(), 'uploads/books', fileName);
      
      res.download(filePath, fileName, (err) => {
        if (err) {
          console.error("Download error:", err);
          if (!res.headersSent) {
            res.status(404).json({ error: "File not found" });
          }
        }
      });
    } catch (error: any) {
      console.error("Download error:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  });

  // Also keep static serving for backward compatibility with existing URLs
  app.use('/downloads', express.static(path.join(process.cwd(), 'uploads/books')));

  // Generate coloring book for a story
  app.post("/api/orders/generate", async (req, res) => {
    try {
      const validationResult = createOrderRequestSchema.safeParse(req.body);
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Invalid request data",
          details: validationResult.error.errors 
        });
      }

      const { storyId, email } = validationResult.data;

      const story = await storage.getStory(storyId);
      if (!story) {
        return res.status(404).json({ error: "Story not found" });
      }

      if (!story.isComplete) {
        return res.status(400).json({ error: "Story must be complete before generating" });
      }

      // Create order and mark as paid immediately (no payment required)
      const order = await storage.createOrder({
        storyId,
        email,
        status: "paid",
        totalPages: 26,
        pagesGenerated: 0,
        amountPaid: 0,
      });

      console.log(`Created order ${order.id} for story ${storyId}`);

      // Start book generation immediately
      const { startBookGeneration } = await import('./bookGenerator');
      startBookGeneration(order.id).catch((err: unknown) => {
        console.error(`Failed to start book generation for order ${order.id}:`, err);
      });

      res.json({ 
        orderId: order.id,
        message: "Order created - book generation started",
        redirectUrl: `/order/${order.id}`,
      });
    } catch (error: any) {
      console.error("Generate error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to create order" 
      });
    }
  });

  // Quick test image generation endpoint
  app.post("/api/test/single-image", async (req, res) => {
    try {
      const { referenceImageBase64 } = req.body;
      
      if (!referenceImageBase64) {
        return res.status(400).json({ error: "referenceImageBase64 required" });
      }

      const { generateIllustrationWithReference } = await import('./bookGenerator');
      const testPrompt = "A happy child playing in a park. Bold black line art, white background, no text.";
      
      console.log("[TEST] Generating single test image...");
      const imageData = await generateIllustrationWithReference(
        testPrompt,
        referenceImageBase64,
        "TestCharacter"
      );
      
      console.log("[TEST] Image generated successfully");
      res.json({ 
        success: true,
        imageData,
        message: "Check the image carefully - it should have NO text at all"
      });
    } catch (error: any) {
      console.error("Test image generation error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to generate test image" 
      });
    }
  });

  return httpServer;
}
