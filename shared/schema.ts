import { z } from "zod";

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
  characterImageData: z.string(), // base64 of the coloring book image
  sections: z.array(storySectionSchema),
  isComplete: z.boolean(),
  createdAt: z.string(),
});

export type Story = z.infer<typeof storySchema>;

// Request to start story creation
export const createStoryRequestSchema = z.object({
  characterName: z.string().min(1, "Character name is required"),
  storyType: z.enum(storyTypes),
  characterImageData: z.string(),
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
