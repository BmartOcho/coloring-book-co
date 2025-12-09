import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Sparkles } from "lucide-react";
import {
  storyTypes,
  storyTypeLabels,
  storyTypeDescriptions,
  type StoryType,
} from "@shared/schema";

interface StoryFormProps {
  onSubmit: (characterName: string, storyType: StoryType) => void;
  isLoading: boolean;
}

export function StoryForm({ onSubmit, isLoading }: StoryFormProps) {
  const [characterName, setCharacterName] = useState("");
  const [storyType, setStoryType] = useState<StoryType | "">("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (characterName.trim() && storyType) {
      onSubmit(characterName.trim(), storyType);
    }
  };

  const isValid = characterName.trim().length > 0 && storyType !== "";

  return (
    <Card className="p-6 sm:p-8 rounded-xl shadow-lg" data-testid="card-story-form">
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <BookOpen className="w-6 h-6 text-primary" />
          <h2 className="font-heading font-semibold text-2xl text-[#2C3E50] dark:text-foreground" data-testid="heading-story-form">
            Create Your Coloring Story Book
          </h2>
        </div>

        <p className="text-[#2C3E50]/70 dark:text-muted-foreground" data-testid="text-story-description">
          Turn your character into the star of their own custom coloring book story! Answer a few questions and we'll create a personalized adventure.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="characterName" className="text-[#2C3E50] dark:text-foreground font-medium">
              Character Name
            </Label>
            <Input
              id="characterName"
              type="text"
              placeholder="Enter your character's name"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="h-12 rounded-xl"
              data-testid="input-character-name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="storyType" className="text-[#2C3E50] dark:text-foreground font-medium">
              What kind of story would you like to tell?
            </Label>
            <Select
              value={storyType}
              onValueChange={(value) => setStoryType(value as StoryType)}
            >
              <SelectTrigger 
                className="h-12 rounded-xl" 
                data-testid="select-story-type"
              >
                <SelectValue placeholder="Choose a story type" />
              </SelectTrigger>
              <SelectContent>
                {storyTypes.map((type) => (
                  <SelectItem 
                    key={type} 
                    value={type}
                    data-testid={`option-story-type-${type}`}
                  >
                    <div className="flex flex-col items-start py-1">
                      <span className="font-medium">{storyTypeLabels[type]}</span>
                      <span className="text-sm text-muted-foreground">
                        {storyTypeDescriptions[type]}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={!isValid || isLoading}
            className="w-full h-12 rounded-xl font-heading font-medium text-base"
            data-testid="button-start-story"
          >
            {isLoading ? (
              "Starting your story..."
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Start Creating Your Story
              </>
            )}
          </Button>
        </form>
      </div>
    </Card>
  );
}
