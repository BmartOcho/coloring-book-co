import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { coloringBookOrders, type InsertColoringBookOrder, type ColoringBookOrder } from "@shared/schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);

export interface IStorage {
  createOrder(order: InsertColoringBookOrder): Promise<ColoringBookOrder>;
  getOrder(id: number): Promise<ColoringBookOrder | undefined>;
  updateOrderProgress(id: number, currentPage: number, generatedImages: string[]): Promise<void>;
  updateOrderStatus(id: number, status: string, completedAt?: Date): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createOrder(order: InsertColoringBookOrder): Promise<ColoringBookOrder> {
    const [newOrder] = await db.insert(coloringBookOrders).values(order).returning();
    return newOrder;
  }

  async getOrder(id: number): Promise<ColoringBookOrder | undefined> {
    const [order] = await db.select().from(coloringBookOrders).where(eq(coloringBookOrders.id, id));
    return order;
  }

  async updateOrderProgress(id: number, currentPage: number, generatedImages: string[]): Promise<void> {
    await db.update(coloringBookOrders)
      .set({ currentPage, generatedImages })
      .where(eq(coloringBookOrders.id, id));
  }

  async updateOrderStatus(id: number, status: string, completedAt?: Date): Promise<void> {
    await db.update(coloringBookOrders)
      .set({ status, completedAt })
      .where(eq(coloringBookOrders.id, id));
  }
}

export const storage = new DatabaseStorage();
