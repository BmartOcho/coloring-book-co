import { z } from "zod";
import { pgTable, text, varchar, boolean, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Database Tables

// Stories table - stores story data in PostgreSQL
export const stories = pgTable("stories", {
  id: varchar("id", { length: 36 }).primaryKey(),
  characterName: text("character_name").notNull(),
  storyType: varchar("story_type", { length: 20 }).notNull(),
  characterImageData: text("character_image_data").notNull(), // Converted coloring book line art
  originalImageData: text("original_image_data"), // Original photo for AI reference
  sections: jsonb("sections").notNull().default([]),
  isComplete: boolean("is_complete").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Orders table - tracks book generation requests
export const orders = pgTable("orders", {
  id: varchar("id", { length: 36 }).primaryKey(),
  storyId: varchar("story_id", { length: 36 }).notNull().references(() => stories.id),
  email: text("email").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  amountPaid: integer("amount_paid"),
  pagesGenerated: integer("pages_generated").notNull().default(0),
  totalPages: integer("total_pages").notNull().default(26),
  pdfUrl: text("pdf_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Book pages table - stores generated coloring page images
export const bookPages = pgTable("book_pages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  orderId: varchar("order_id", { length: 36 }).notNull().references(() => orders.id),
  pageNumber: integer("page_number").notNull(),
  pageType: varchar("page_type", { length: 20 }).notNull(),
  storyText: text("story_text"),
  imagePrompt: text("image_prompt"),
  imageData: text("image_data"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Insert schemas for validation
export const insertStorySchema = createInsertSchema(stories).omit({ createdAt: true });
export const insertOrderSchema = createInsertSchema(orders).omit({ createdAt: true, completedAt: true });
export const insertBookPageSchema = createInsertSchema(bookPages).omit({ createdAt: true });

// Types from Drizzle tables
export type DbStory = typeof stories.$inferSelect;
export type InsertStory = typeof stories.$inferInsert;
export type DbOrder = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;
export type DbBookPage = typeof bookPages.$inferSelect;
export type InsertBookPage = typeof bookPages.$inferInsert;

// Schema for image conversion request
export const imageConversionRequestSchema = z.object({
  imageData: z.string(), // base64 encoded image
  fileName: z.string(),
});

export type ImageConversionRequest = z.infer<typeof imageConversionRequestSchema>;

// Schema for image conversion response
export const imageConversionResponseSchema = z.object({
  originalImage: z.string(), // base64 encoded
  coloringBookImage: z.string(), // base64 encoded
  fileName: z.string(),
});

export type ImageConversionResponse = z.infer<typeof imageConversionResponseSchema>;

// Story Types
export const storyTypes = [
  "adventure",
  "hero",
  "explorer",
  "dream_career",
] as const;

export type StoryType = typeof storyTypes[number];

export const storyTypeLabels: Record<StoryType, string> = {
  adventure: "Adventure Story",
  hero: "Hero's Tale",
  explorer: "Explorer Story",
  dream_career: "What They Want To Be",
};

export const storyTypeDescriptions: Record<StoryType, string> = {
  adventure: "Treasure hunting, finding lost civilizations, climbing the tallest mountain",
  hero: "Fighting dragons, warriors, saving a princess, being brave",
  explorer: "Discovering new things on Earth, in deep space, or under the sea",
  dream_career: "Living their dreams as a doctor, firefighter, pilot, or any career",
};

// Story Section - represents one part of the interactive storyboard
export const storySectionSchema = z.object({
  sectionNumber: z.number(),
  prompt: z.string(), // The mad-lib style prompt with blanks
  userInputs: z.record(z.string(), z.string()), // User's filled-in values
  generatedText: z.string(), // AI-generated story text for this section
  isComplete: z.boolean(),
});

export type StorySection = z.infer<typeof storySectionSchema>;

// Story - the complete story with all sections
export const storySchema = z.object({
  id: z.string(),
  characterName: z.string(),
  storyType: z.enum(storyTypes),
  characterImageData: z.string(), // base64 of the coloring book image (line art)
  originalImageData: z.string().optional(), // base64 of the original photo for AI reference
  sections: z.array(storySectionSchema),
  isComplete: z.boolean(),
  createdAt: z.string(),
});

export type Story = z.infer<typeof storySchema>;

// Request to start story creation
export const createStoryRequestSchema = z.object({
  characterName: z.string().min(1, "Character name is required"),
  storyType: z.enum(storyTypes),
  characterImageData: z.string(), // Converted coloring book line art
  originalImageData: z.string().optional(), // Original photo for AI reference
});

export type CreateStoryRequest = z.infer<typeof createStoryRequestSchema>;

// Request to generate the next story section prompt
export const generateSectionPromptRequestSchema = z.object({
  storyId: z.string(),
  sectionNumber: z.number(),
});

export type GenerateSectionPromptRequest = z.infer<typeof generateSectionPromptRequestSchema>;

// Request to submit user inputs for a section and generate story text
export const submitSectionInputsRequestSchema = z.object({
  storyId: z.string(),
  sectionNumber: z.number(),
  userInputs: z.record(z.string(), z.string()),
});

export type SubmitSectionInputsRequest = z.infer<typeof submitSectionInputsRequestSchema>;

// Response with the generated section prompt (mad-lib style)
export const sectionPromptResponseSchema = z.object({
  sectionNumber: z.number(),
  prompt: z.string(),
  blanks: z.array(z.object({
    key: z.string(),
    label: z.string(),
    placeholder: z.string(),
  })),
});

export type SectionPromptResponse = z.infer<typeof sectionPromptResponseSchema>;

// Response after submitting section inputs
export const sectionCompleteResponseSchema = z.object({
  sectionNumber: z.number(),
  generatedText: z.string(),
  isStoryComplete: z.boolean(),
  totalSections: z.number(),
});

export type SectionCompleteResponse = z.infer<typeof sectionCompleteResponseSchema>;
