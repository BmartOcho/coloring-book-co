import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Coloring book orders table
export const coloringBookOrders = pgTable("coloring_book_orders", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  sourceImage: text("source_image").notNull(), // base64 of source image
  initialColoringImage: text("initial_coloring_image").notNull(), // base64 of first coloring page
  status: text("status").notNull().default("pending"), // pending, generating, completed, failed
  currentPage: integer("current_page").notNull().default(0),
  totalPages: integer("total_pages").notNull().default(25),
  generatedImages: jsonb("generated_images").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertColoringBookOrderSchema = createInsertSchema(coloringBookOrders).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export type InsertColoringBookOrder = z.infer<typeof insertColoringBookOrderSchema>;
export type ColoringBookOrder = typeof coloringBookOrders.$inferSelect;

// Schema for image conversion request
export const imageConversionRequestSchema = z.object({
  imageData: z.string(), // base64 encoded image
  fileName: z.string(),
  detailLevel: z.enum(["1", "2"]).default("1"), // 1=simple, 2=complex
});

export type ImageConversionRequest = z.infer<typeof imageConversionRequestSchema>;

// Schema for image conversion response
export const imageConversionResponseSchema = z.object({
  originalImage: z.string(), // base64 encoded
  coloringBookImage: z.string(), // base64 encoded
  fileName: z.string(),
});

export type ImageConversionResponse = z.infer<typeof imageConversionResponseSchema>;

// Schema for creating a full coloring book order
export const createOrderRequestSchema = z.object({
  email: z.string().email(),
  sourceImage: z.string(), // base64 encoded
  initialColoringImage: z.string(), // base64 encoded
});

export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
