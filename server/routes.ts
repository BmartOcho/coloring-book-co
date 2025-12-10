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
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
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
        originalImageData, // Include original photo for AI reference
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

  // Get Stripe publishable key
  app.get("/api/stripe/config", async (req, res) => {
    try {
      const publishableKey = await getStripePublishableKey();
      res.json({ publishableKey });
    } catch (error: any) {
      console.error("Stripe config error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to get Stripe config" 
      });
    }
  });

  // Create checkout session for coloring book purchase
  app.post("/api/orders/checkout", async (req, res) => {
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
        return res.status(400).json({ error: "Story must be complete before purchasing" });
      }

      const stripe = await getUncachableStripeClient();

      const prices = await storage.listPrices(true, 1, 0);
      if (prices.length === 0) {
        return res.status(500).json({ error: "No pricing available. Please try again later." });
      }
      const priceId = prices[0].id;

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const order = await storage.createOrder({
        storyId,
        email,
        status: "pending",
        totalPages: 26,
        pagesGenerated: 0,
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/order/${order.id}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/order/${order.id}/cancel`,
        customer_email: email,
        metadata: {
          orderId: order.id,
          storyId: storyId,
          characterName: story.characterName,
        },
      });

      await storage.updateOrder(order.id, {
        stripeSessionId: session.id,
      });

      res.json({ 
        checkoutUrl: session.url,
        orderId: order.id,
      });
    } catch (error: any) {
      console.error("Checkout error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to create checkout session" 
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

  // Verify payment and update order status (fallback if webhook delayed)
  app.post("/api/orders/:id/verify-payment", async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // If already processed, just return current status
      if (order.status === 'paid' || order.status === 'generating' || order.status === 'completed') {
        return res.json({ 
          status: order.status,
          message: "Order already processed" 
        });
      }

      if (!order.stripeSessionId) {
        return res.status(400).json({ error: "No payment session found" });
      }

      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(order.stripeSessionId);

      // Verify session belongs to this order
      if (session.metadata?.orderId !== order.id) {
        console.error(`Session ${session.id} metadata.orderId (${session.metadata?.orderId}) doesn't match order ${order.id}`);
        return res.status(400).json({ error: "Session does not match order" });
      }

      if (session.payment_status === 'paid') {
        // Check if webhook already processed this (idempotency)
        const refreshedOrder = await storage.getOrder(order.id);
        if (refreshedOrder && (refreshedOrder.status === 'paid' || refreshedOrder.status === 'generating' || refreshedOrder.status === 'completed')) {
          return res.json({ 
            status: refreshedOrder.status,
            message: "Order already processed" 
          });
        }

        await storage.updateOrder(order.id, {
          status: "paid",
          amountPaid: session.amount_total,
          stripePaymentIntentId: session.payment_intent as string,
        });

        // Start book generation (same as webhook handler)
        const { startBookGeneration } = await import('./bookGenerator');
        startBookGeneration(order.id).catch((err: unknown) => {
          console.error(`Failed to start book generation for order ${order.id}:`, err);
        });

        res.json({ 
          status: "paid",
          message: "Payment verified and book generation started" 
        });
      } else {
        res.json({ 
          status: session.payment_status,
          message: "Payment not completed" 
        });
      }
    } catch (error: any) {
      console.error("Verify payment error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to verify payment" 
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

  // Test endpoint: Generate coloring book without payment (development only)
  app.post("/api/orders/test-generate", async (req, res) => {
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

      // Create order and mark as paid immediately (bypassing Stripe)
      const order = await storage.createOrder({
        storyId,
        email,
        status: "paid",
        totalPages: 26,
        pagesGenerated: 0,
        amountPaid: 0, // Free test
      });

      console.log(`[TEST] Created test order ${order.id} for story ${storyId}`);

      // Start book generation immediately
      const { startBookGeneration } = await import('./bookGenerator');
      startBookGeneration(order.id).catch((err: unknown) => {
        console.error(`Failed to start book generation for order ${order.id}:`, err);
      });

      res.json({ 
        orderId: order.id,
        message: "Test order created - book generation started",
        redirectUrl: `/order/${order.id}`,
      });
    } catch (error: any) {
      console.error("Test generate error:", error);
      res.status(500).json({ 
        error: error.message || "Failed to create test order" 
      });
    }
  });

  return httpServer;
}
