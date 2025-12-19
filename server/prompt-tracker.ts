import fs from "fs";
import path from "path";

// File to persist failed prompt counts across restarts
const FAILED_PROMPTS_FILE = path.join(process.cwd(), "failed-prompts.json");
const MAX_FAILURES_BEFORE_REMOVAL = 10;

interface FailedPromptData {
  [prompt: string]: {
    count: number;
    lastFailed: string;
    errors: string[];
  };
}

// In-memory cache of failed prompts
let failedPrompts: FailedPromptData = {};

// Load failed prompts from disk on startup
export function loadFailedPrompts(): void {
  try {
    if (fs.existsSync(FAILED_PROMPTS_FILE)) {
      const data = fs.readFileSync(FAILED_PROMPTS_FILE, "utf-8");
      failedPrompts = JSON.parse(data);
      console.log(
        `[PromptTracker] Loaded ${Object.keys(failedPrompts).length} tracked prompts from disk`,
      );

      // Log any prompts that are close to or at the removal threshold
      for (const [prompt, data] of Object.entries(failedPrompts)) {
        if (data.count >= MAX_FAILURES_BEFORE_REMOVAL) {
          console.log(
            `[PromptTracker] BLOCKED (${data.count} failures): "${prompt.substring(0, 50)}..."`,
          );
        } else if (data.count >= MAX_FAILURES_BEFORE_REMOVAL - 3) {
          console.log(
            `[PromptTracker] WARNING (${data.count}/${MAX_FAILURES_BEFORE_REMOVAL} failures): "${prompt.substring(0, 50)}..."`,
          );
        }
      }
    } else {
      console.log(
        "[PromptTracker] No existing failed prompts file, starting fresh",
      );
    }
  } catch (error) {
    console.error("[PromptTracker] Error loading failed prompts:", error);
    failedPrompts = {};
  }
}

// Save failed prompts to disk
function saveFailedPrompts(): void {
  try {
    fs.writeFileSync(
      FAILED_PROMPTS_FILE,
      JSON.stringify(failedPrompts, null, 2),
    );
  } catch (error) {
    console.error("[PromptTracker] Error saving failed prompts:", error);
  }
}

// Record a prompt failure
export function recordPromptFailure(
  prompt: string,
  errorMessage: string,
): number {
  const now = new Date().toISOString();

  if (!failedPrompts[prompt]) {
    failedPrompts[prompt] = {
      count: 0,
      lastFailed: now,
      errors: [],
    };
  }

  failedPrompts[prompt].count++;
  failedPrompts[prompt].lastFailed = now;

  // Keep last 5 error messages for debugging
  failedPrompts[prompt].errors.push(errorMessage.substring(0, 200));
  if (failedPrompts[prompt].errors.length > 5) {
    failedPrompts[prompt].errors.shift();
  }

  const count = failedPrompts[prompt].count;

  console.log(
    `[PromptTracker] Prompt failed (${count}/${MAX_FAILURES_BEFORE_REMOVAL}): "${prompt.substring(0, 50)}..."`,
  );

  if (count >= MAX_FAILURES_BEFORE_REMOVAL) {
    console.log(
      `[PromptTracker] ⚠️ PROMPT BLOCKED - exceeded ${MAX_FAILURES_BEFORE_REMOVAL} failures: "${prompt}"`,
    );
  }

  saveFailedPrompts();

  return count;
}

// Check if a prompt is blocked (has failed too many times)
export function isPromptBlocked(prompt: string): boolean {
  const data = failedPrompts[prompt];
  return data ? data.count >= MAX_FAILURES_BEFORE_REMOVAL : false;
}

// Get the failure count for a prompt
export function getPromptFailureCount(prompt: string): number {
  return failedPrompts[prompt]?.count || 0;
}

// Get all blocked prompts
export function getBlockedPrompts(): string[] {
  return Object.entries(failedPrompts)
    .filter(([_, data]) => data.count >= MAX_FAILURES_BEFORE_REMOVAL)
    .map(([prompt, _]) => prompt);
}

// Get a summary of all tracked prompts
export function getPromptTrackingSummary(): {
  total: number;
  blocked: number;
  warning: number;
  prompts: { prompt: string; count: number; blocked: boolean }[];
} {
  const prompts = Object.entries(failedPrompts)
    .map(([prompt, data]) => ({
      prompt,
      count: data.count,
      blocked: data.count >= MAX_FAILURES_BEFORE_REMOVAL,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    total: prompts.length,
    blocked: prompts.filter((p) => p.blocked).length,
    warning: prompts.filter(
      (p) => !p.blocked && p.count >= MAX_FAILURES_BEFORE_REMOVAL - 3,
    ).length,
    prompts,
  };
}

// Reset a prompt's failure count (useful if you want to give a prompt another chance)
export function resetPromptFailures(prompt: string): void {
  if (failedPrompts[prompt]) {
    console.log(
      `[PromptTracker] Resetting failures for: "${prompt.substring(0, 50)}..."`,
    );
    delete failedPrompts[prompt];
    saveFailedPrompts();
  }
}

// Reset all prompt failures (nuclear option)
export function resetAllPromptFailures(): void {
  console.log(
    `[PromptTracker] Resetting all ${Object.keys(failedPrompts).length} tracked prompts`,
  );
  failedPrompts = {};
  saveFailedPrompts();
}

// Initialize on module load
loadFailedPrompts();
