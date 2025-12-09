import type { Express } from "express";
import { createServer, type Server } from "http";
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

      const { characterName, storyType, characterImageData } = validationResult.data;

      const story = await storage.createStory({
        characterName,
        storyType,
        characterImageData,
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

  return httpServer;
}
