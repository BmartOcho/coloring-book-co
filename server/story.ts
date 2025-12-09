import OpenAI from "openai";
import type { StoryType, SectionPromptResponse } from "@shared/schema";

const client = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const TOTAL_SECTIONS = 5;

const storyTypePrompts: Record<StoryType, string> = {
  adventure: "an exciting adventure story involving treasure hunting, discovering lost civilizations, or embarking on epic journeys",
  hero: "a heroic tale involving brave deeds, overcoming challenges, saving others, or facing mythical creatures",
  explorer: "an exploration story involving discovering new places on Earth, in space, under the sea, or in mysterious lands",
  dream_career: "an inspiring story about pursuing their dream career, showing the journey from childhood dream to achieving their goal",
};

export async function generateSectionPrompt(
  characterName: string,
  storyType: StoryType,
  sectionNumber: number,
  previousSections: { userInputs: Record<string, string>; generatedText: string }[]
): Promise<SectionPromptResponse> {
  const storyContext = storyTypePrompts[storyType];
  
  const previousContext = previousSections.length > 0
    ? `\n\nStory so far:\n${previousSections.map((s, i) => `Section ${i + 1}: ${s.generatedText}`).join("\n\n")}`
    : "";

  const sectionDescriptions: Record<number, string> = {
    1: "the beginning - introduce the character and set up the adventure",
    2: "the journey begins - the character takes their first steps",
    3: "challenges arise - the character faces obstacles",
    4: "the climax - the most exciting moment of the story",
    5: "the conclusion - how the adventure ends and what the character learned",
  };

  const systemPrompt = `You are a children's coloring book story writer. Create engaging, age-appropriate stories for children ages 4-10.

Your task is to generate a "mad-lib" style prompt for section ${sectionNumber} of ${TOTAL_SECTIONS} of the story.
This section should cover: ${sectionDescriptions[sectionNumber] || "continuing the adventure"}

The prompt should have 2-3 fill-in-the-blank spaces that let the user customize the story.
Each blank should be creative and fun, helping shape the direction of the story.

Respond in this exact JSON format:
{
  "prompt": "The story prompt text with [BLANK_KEY] placeholders where the user fills in",
  "blanks": [
    {"key": "BLANK_KEY", "label": "A short label for this blank", "placeholder": "Example input"}
  ]
}

Rules:
- Use exactly 2-3 blanks per prompt
- Make blanks fun and imaginative (colors, objects, places, feelings, etc.)
- Keep language simple and child-friendly
- Each blank key should be UPPERCASE_WITH_UNDERSCORES
- The prompt should be 1-2 sentences
- Build on previous sections if they exist`;

  const userPrompt = `Character name: ${characterName}
Story type: ${storyContext}
Section: ${sectionNumber} of ${TOTAL_SECTIONS}${previousContext}

Generate the mad-lib prompt for this section.`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.8,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const parsed = JSON.parse(content);
  
  return {
    sectionNumber,
    prompt: parsed.prompt,
    blanks: parsed.blanks,
  };
}

export async function generateSectionText(
  characterName: string,
  storyType: StoryType,
  sectionNumber: number,
  prompt: string,
  userInputs: Record<string, string>,
  previousSections: { generatedText: string }[]
): Promise<string> {
  const storyContext = storyTypePrompts[storyType];
  
  let filledPrompt = prompt;
  for (const [key, value] of Object.entries(userInputs)) {
    filledPrompt = filledPrompt.replace(`[${key}]`, value);
  }

  const previousContext = previousSections.length > 0
    ? `\n\nStory so far:\n${previousSections.map((s, i) => `Section ${i + 1}: ${s.generatedText}`).join("\n\n")}`
    : "";

  const systemPrompt = `You are a children's coloring book story writer. Write engaging, age-appropriate story sections for children ages 4-10.

Write 2-3 short paragraphs (about 100-150 words total) for this section of the story.
The writing should be:
- Simple and easy to understand
- Exciting and engaging for young children
- Descriptive enough to inspire coloring book illustrations
- Connected to any previous sections
- Building toward a satisfying story arc

Do not include any formatting, headers, or meta-commentary. Just write the story text.`;

  const userPrompt = `Character name: ${characterName}
Story type: ${storyContext}
Section ${sectionNumber} of ${TOTAL_SECTIONS}
User's creative input for this section: "${filledPrompt}"${previousContext}

Write the story text for this section.`;

  const response = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  return content.trim();
}

export function getTotalSections(): number {
  return TOTAL_SECTIONS;
}
