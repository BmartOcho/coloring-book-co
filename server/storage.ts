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
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export interface IStorage {
  getStory(id: string): Promise<Story | undefined>;
  createStory(story: Omit<Story, "id" | "createdAt">): Promise<Story>;
  updateStory(id: string, updates: Partial<Story>): Promise<Story | undefined>;
  addSection(storyId: string, section: StorySection): Promise<Story | undefined>;
  updateSection(storyId: string, sectionNumber: number, updates: Partial<StorySection>): Promise<Story | undefined>;
  
  createOrder(order: Omit<InsertOrder, "id">): Promise<DbOrder>;
  getOrder(id: string): Promise<DbOrder | undefined>;
  getOrderByStripeSession(sessionId: string): Promise<DbOrder | undefined>;
  updateOrder(id: string, updates: Partial<DbOrder>): Promise<DbOrder | undefined>;
  
  createBookPage(page: Omit<InsertBookPage, "id">): Promise<DbBookPage>;
  getBookPages(orderId: string): Promise<DbBookPage[]>;
  updateBookPage(id: string, updates: Partial<DbBookPage>): Promise<DbBookPage | undefined>;
  
  getProduct(productId: string): Promise<any>;
  listProducts(active?: boolean, limit?: number, offset?: number): Promise<any[]>;
  listProductsWithPrices(active?: boolean, limit?: number, offset?: number): Promise<any[]>;
  getPrice(priceId: string): Promise<any>;
  listPrices(active?: boolean, limit?: number, offset?: number): Promise<any[]>;
  getPricesForProduct(productId: string): Promise<any[]>;
  getSubscription(subscriptionId: string): Promise<any>;
}

function dbStoryToStory(dbStory: DbStory): Story {
  return {
    id: dbStory.id,
    characterName: dbStory.characterName,
    storyType: dbStory.storyType as Story["storyType"],
    characterImageData: dbStory.characterImageData,
    originalImageData: dbStory.originalImageData || undefined, // Original photo for AI reference
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
      originalImageData: storyData.originalImageData, // Original photo for AI reference
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

  async getOrderByStripeSession(sessionId: string): Promise<DbOrder | undefined> {
    const [result] = await db.select().from(orders).where(eq(orders.stripeSessionId, sessionId));
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

  async getProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE id = ${productId}`
    );
    return (result as any)[0] || null;
  }

  async listProducts(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.products WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result as any[];
  }

  async listProductsWithPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`
        WITH paginated_products AS (
          SELECT id, name, description, metadata, active
          FROM stripe.products
          WHERE active = ${active}
          ORDER BY id
          LIMIT ${limit} OFFSET ${offset}
        )
        SELECT 
          p.id as product_id,
          p.name as product_name,
          p.description as product_description,
          p.active as product_active,
          p.metadata as product_metadata,
          pr.id as price_id,
          pr.unit_amount,
          pr.currency,
          pr.recurring,
          pr.active as price_active,
          pr.metadata as price_metadata
        FROM paginated_products p
        LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
        ORDER BY p.id, pr.unit_amount
      `
    );
    return result as any[];
  }

  async getPrice(priceId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE id = ${priceId}`
    );
    return (result as any)[0] || null;
  }

  async listPrices(active = true, limit = 20, offset = 0) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE active = ${active} LIMIT ${limit} OFFSET ${offset}`
    );
    return result as any[];
  }

  async getPricesForProduct(productId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.prices WHERE product = ${productId} AND active = true`
    );
    return result as any[];
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return (result as any)[0] || null;
  }
}

export const storage = new DatabaseStorage();
