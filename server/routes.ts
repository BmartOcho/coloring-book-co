import type { Express } from "express";
import { createServer, type Server } from "http";
import { imageConversionRequestSchema, createOrderRequestSchema } from "@shared/schema";
import { convertToColoringBook } from "./openai";
import { generateColoringBookPDF } from "./pdf";
import { storage } from "./storage";
import { sendOrderConfirmationEmail } from "./email";
import { startBackgroundGeneration } from "./background-generator";
import { Buffer } from "node:buffer";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const hasOpenAI = !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY && process.env.AI_INTEGRATIONS_OPENAI_BASE_URL);
    const hasResend = !!process.env.RESEND_API_KEY;
    const hasDatabase = !!process.env.DATABASE_URL;
    
    res.json({
      status: "ok",
      openai: hasOpenAI ? "configured" : "missing",
      email: hasResend ? "configured" : "missing",
      database: hasDatabase ? "configured" : "missing",
    });
  });

  // Image conversion endpoint
  app.post("/api/convert", async (req, res) => {
    try {
      const validationResult = imageConversionRequestSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid request data",
          details: validationResult.error.errors,
        });
      }

      const { imageData, fileName, detailLevel } = validationResult.data;
      const imageBuffer = Buffer.from(imageData, "base64");

      if (imageBuffer.length > 50 * 1024 * 1024) {
        return res.status(400).json({
          error: "Image too large. Maximum size is 50MB.",
        });
      }

      const coloringBookImage = await convertToColoringBook(imageBuffer, fileName, detailLevel);

      res.json({
        originalImage: "data:image/png;base64," + imageData,
        coloringBookImage,
        fileName: "coloring-book-" + fileName,
      });
    } catch (error: any) {
      console.error("Conversion error:", error);
      res.status(500).json({
        error: error.message || "Failed to convert image",
      });
    }
  });

  // PDF download endpoint
  app.post("/api/convert-pdf", async (req, res) => {
    try {
      const { imageData } = req.body;

      if (!imageData) {
        return res.status(400).json({
          error: "Image data is required",
        });
      }

      const pdfBuffer = await generateColoringBookPDF(imageData);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="coloring-book-${Date.now()}.pdf"`);
      res.send(pdfBuffer);
    } catch (error: any) {
      console.error("PDF generation error:", error);
      res.status(500).json({
        error: error.message || "Failed to generate PDF",
      });
    }
  });

  // Create coloring book order endpoint
  app.post("/api/orders", async (req, res) => {
    try {
      const validationResult = createOrderRequestSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Invalid request data",
          details: validationResult.error.errors,
        });
      }

      const { email, sourceImage, initialColoringImage, detailLevel } = validationResult.data;

      // Create order in database
      const order = await storage.createOrder({
        email,
        sourceImage,
        initialColoringImage,
        detailLevel,
        status: "pending",
        currentPage: 1,
        totalPages: 30,
        generatedImages: [initialColoringImage],
      });

      // Get the base URL for the progress page
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers.host || "localhost:5000";
      const progressUrl = `${protocol}://${host}/progress/${order.id}`;

      // Send confirmation email
      try {
        await sendOrderConfirmationEmail(email, order.id, progressUrl);
      } catch (emailError) {
        console.error("Failed to send confirmation email:", emailError);
        // Continue even if email fails
      }

      // Start background generation (don't await - let it run in background)
      const baseUrl = `${protocol}://${host}`;
      startBackgroundGeneration(order.id, 1, baseUrl).catch((err) => {
        console.error("Background generation error:", err);
      });

      res.json({
        orderId: order.id,
        progressUrl,
        message: "Your coloring book is being generated!",
      });
    } catch (error: any) {
      console.error("Order creation error:", error);
      res.status(500).json({
        error: error.message || "Failed to create order",
      });
    }
  });

  // Get order progress endpoint
  app.get("/api/orders/:id", async (req, res) => {
    try {
      const orderId = parseInt(req.params.id, 10);

      if (isNaN(orderId)) {
        return res.status(400).json({
          error: "Invalid order ID",
        });
      }

      const order = await storage.getOrder(orderId);

      if (!order) {
        return res.status(404).json({
          error: "Order not found",
        });
      }

      res.json({
        id: order.id,
        email: order.email,
        status: order.status,
        currentPage: order.currentPage,
        totalPages: order.totalPages,
        generatedImages: order.generatedImages,
        createdAt: order.createdAt,
        completedAt: order.completedAt,
      });
    } catch (error: any) {
      console.error("Get order error:", error);
      res.status(500).json({
        error: error.message || "Failed to get order",
      });
    }
  });

  return httpServer;
}
