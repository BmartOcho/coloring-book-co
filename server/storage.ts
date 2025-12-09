import { type Story, type StorySection } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getStory(id: string): Promise<Story | undefined>;
  createStory(story: Omit<Story, "id" | "createdAt">): Promise<Story>;
  updateStory(id: string, updates: Partial<Story>): Promise<Story | undefined>;
  addSection(storyId: string, section: StorySection): Promise<Story | undefined>;
  updateSection(storyId: string, sectionNumber: number, updates: Partial<StorySection>): Promise<Story | undefined>;
}

export class MemStorage implements IStorage {
  private stories: Map<string, Story>;

  constructor() {
    this.stories = new Map();
  }

  async getStory(id: string): Promise<Story | undefined> {
    return this.stories.get(id);
  }

  async createStory(storyData: Omit<Story, "id" | "createdAt">): Promise<Story> {
    const id = randomUUID();
    const story: Story = {
      ...storyData,
      id,
      createdAt: new Date().toISOString(),
    };
    this.stories.set(id, story);
    return story;
  }

  async updateStory(id: string, updates: Partial<Story>): Promise<Story | undefined> {
    const story = this.stories.get(id);
    if (!story) return undefined;
    
    const updatedStory = { ...story, ...updates };
    this.stories.set(id, updatedStory);
    return updatedStory;
  }

  async addSection(storyId: string, section: StorySection): Promise<Story | undefined> {
    const story = this.stories.get(storyId);
    if (!story) return undefined;
    
    const updatedStory = {
      ...story,
      sections: [...story.sections, section],
    };
    this.stories.set(storyId, updatedStory);
    return updatedStory;
  }

  async updateSection(storyId: string, sectionNumber: number, updates: Partial<StorySection>): Promise<Story | undefined> {
    const story = this.stories.get(storyId);
    if (!story) return undefined;
    
    const updatedSections = story.sections.map(section => 
      section.sectionNumber === sectionNumber 
        ? { ...section, ...updates }
        : section
    );
    
    const updatedStory = { ...story, sections: updatedSections };
    this.stories.set(storyId, updatedStory);
    return updatedStory;
  }
}

export const storage = new MemStorage();
