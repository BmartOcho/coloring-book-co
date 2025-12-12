import { 
  type Story, 
  type StorySection,
  stories,
  orders,
  bookPages,
  type DbStory,
  type DbOrder,
  type DbBookPage,
  type InsertOrder,
  type InsertBookPage,
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getStory(id: string): Promise<Story | undefined>;
  createStory(story: Omit<Story, "id" | "createdAt">): Promise<Story>;
  updateStory(id: string, updates: Partial<Story>): Promise<Story | undefined>;
  addSection(storyId: string, section: StorySection): Promise<Story | undefined>;
  updateSection(storyId: string, sectionNumber: number, updates: Partial<StorySection>): Promise<Story | undefined>;
  
  createOrder(order: Omit<InsertOrder, "id">): Promise<DbOrder>;
  getOrder(id: string): Promise<DbOrder | undefined>;
  updateOrder(id: string, updates: Partial<DbOrder>): Promise<DbOrder | undefined>;
  
  createBookPage(page: Omit<InsertBookPage, "id">): Promise<DbBookPage>;
  getBookPages(orderId: string): Promise<DbBookPage[]>;
  updateBookPage(id: string, updates: Partial<DbBookPage>): Promise<DbBookPage | undefined>;
}

function dbStoryToStory(dbStory: DbStory): Story {
  return {
    id: dbStory.id,
    characterName: dbStory.characterName,
    storyType: dbStory.storyType as Story["storyType"],
    characterImageData: dbStory.characterImageData,
    originalImageData: dbStory.originalImageData || undefined,
    sections: dbStory.sections as StorySection[],
    isComplete: dbStory.isComplete,
    createdAt: dbStory.createdAt.toISOString(),
  };
}

export class DatabaseStorage implements IStorage {
  async getStory(id: string): Promise<Story | undefined> {
    const [result] = await db.select().from(stories).where(eq(stories.id, id));
    return result ? dbStoryToStory(result) : undefined;
  }

  async createStory(storyData: Omit<Story, "id" | "createdAt">): Promise<Story> {
    const id = randomUUID();
    const [result] = await db.insert(stories).values({
      id,
      characterName: storyData.characterName,
      storyType: storyData.storyType,
      characterImageData: storyData.characterImageData,
      originalImageData: storyData.originalImageData,
      sections: storyData.sections,
      isComplete: storyData.isComplete,
    }).returning();
    return dbStoryToStory(result);
  }

  async updateStory(id: string, updates: Partial<Story>): Promise<Story | undefined> {
    const updateData: Partial<DbStory> = {};
    if (updates.characterName !== undefined) updateData.characterName = updates.characterName;
    if (updates.storyType !== undefined) updateData.storyType = updates.storyType;
    if (updates.characterImageData !== undefined) updateData.characterImageData = updates.characterImageData;
    if (updates.sections !== undefined) updateData.sections = updates.sections;
    if (updates.isComplete !== undefined) updateData.isComplete = updates.isComplete;

    const [result] = await db.update(stories).set(updateData).where(eq(stories.id, id)).returning();
    return result ? dbStoryToStory(result) : undefined;
  }

  async addSection(storyId: string, section: StorySection): Promise<Story | undefined> {
    const story = await this.getStory(storyId);
    if (!story) return undefined;
    
    const newSections = [...story.sections, section];
    return this.updateStory(storyId, { sections: newSections });
  }

  async updateSection(storyId: string, sectionNumber: number, updates: Partial<StorySection>): Promise<Story | undefined> {
    const story = await this.getStory(storyId);
    if (!story) return undefined;
    
    const updatedSections = story.sections.map(section => 
      section.sectionNumber === sectionNumber 
        ? { ...section, ...updates }
        : section
    );
    
    return this.updateStory(storyId, { sections: updatedSections });
  }

  async createOrder(orderData: Omit<InsertOrder, "id">): Promise<DbOrder> {
    const id = randomUUID();
    const [result] = await db.insert(orders).values({
      id,
      ...orderData,
    }).returning();
    return result;
  }

  async getOrder(id: string): Promise<DbOrder | undefined> {
    const [result] = await db.select().from(orders).where(eq(orders.id, id));
    return result;
  }

  async updateOrder(id: string, updates: Partial<DbOrder>): Promise<DbOrder | undefined> {
    const [result] = await db.update(orders).set(updates).where(eq(orders.id, id)).returning();
    return result;
  }

  async createBookPage(pageData: Omit<InsertBookPage, "id">): Promise<DbBookPage> {
    const id = randomUUID();
    const [result] = await db.insert(bookPages).values({
      id,
      ...pageData,
    }).returning();
    return result;
  }

  async getBookPages(orderId: string): Promise<DbBookPage[]> {
    return db.select().from(bookPages).where(eq(bookPages.orderId, orderId));
  }

  async updateBookPage(id: string, updates: Partial<DbBookPage>): Promise<DbBookPage | undefined> {
    const [result] = await db.update(bookPages).set(updates).where(eq(bookPages.id, id)).returning();
    return result;
  }
}

export const storage = new DatabaseStorage();
