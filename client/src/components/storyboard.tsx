import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RotateCcw, ArrowRight, CheckCircle, BookOpen } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { 
  Story, 
  SectionPromptResponse, 
  SectionCompleteResponse 
} from "@shared/schema";

interface StoryboardProps {
  story: Story;
  onStoryUpdate: (story: Story) => void;
  onComplete: () => void;
}

interface BlankField {
  key: string;
  label: string;
  placeholder: string;
}

export function Storyboard({ story, onStoryUpdate, onComplete }: StoryboardProps) {
  const [currentPrompt, setCurrentPrompt] = useState<SectionPromptResponse | null>(null);
  const [userInputs, setUserInputs] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const generatePromptMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/stories/${story.id}/generate-prompt`);
      return response.json() as Promise<SectionPromptResponse>;
    },
    onSuccess: (data) => {
      setCurrentPrompt(data);
      setUserInputs({});
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate prompt",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitSectionMutation = useMutation({
    mutationFn: async () => {
      if (!currentPrompt) throw new Error("No prompt available");
      
      const response = await apiRequest("POST", `/api/stories/${story.id}/submit-section`, {
        sectionNumber: currentPrompt.sectionNumber,
        userInputs,
        prompt: currentPrompt.prompt,
      });
      return response.json() as Promise<SectionCompleteResponse>;
    },
    onSuccess: (data) => {
      const updatedSections = [
        ...story.sections,
        {
          sectionNumber: data.sectionNumber,
          prompt: currentPrompt?.prompt || "",
          userInputs,
          generatedText: data.generatedText,
          isComplete: true,
        },
      ];
      
      onStoryUpdate({
        ...story,
        sections: updatedSections,
        isComplete: data.isStoryComplete,
      });

      if (data.isStoryComplete) {
        toast({
          title: "Story Complete!",
          description: "Your coloring book story is ready!",
          className: "bg-[#95E1D3] border-[#95E1D3] text-[#2C3E50]",
        });
        onComplete();
      } else {
        setCurrentPrompt(null);
        generatePromptMutation.mutate();
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to generate story section",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const redoSectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/stories/${story.id}/redo-section`);
      return response.json() as Promise<Story>;
    },
    onSuccess: (data) => {
      onStoryUpdate(data);
      setCurrentPrompt(null);
      generatePromptMutation.mutate();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to redo section",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!story.isComplete && !currentPrompt && !generatePromptMutation.isPending) {
      generatePromptMutation.mutate();
    }
  }, [story.id]);

  const handleInputChange = (key: string, value: string) => {
    setUserInputs((prev) => ({ ...prev, [key]: value }));
  };

  const allInputsFilled = currentPrompt?.blanks.every(
    (blank) => userInputs[blank.key]?.trim()
  );

  const isLoading = generatePromptMutation.isPending || submitSectionMutation.isPending;

  const renderPromptWithBlanks = () => {
    if (!currentPrompt) return null;
    
    let promptText = currentPrompt.prompt;
    currentPrompt.blanks.forEach((blank) => {
      const value = userInputs[blank.key];
      const display = value 
        ? `<span class="font-bold text-primary">${value}</span>` 
        : `<span class="bg-accent/30 px-2 py-0.5 rounded">[${blank.label}]</span>`;
      promptText = promptText.replace(`[${blank.key}]`, display);
    });
    
    return (
      <p 
        className="text-lg leading-relaxed text-[#2C3E50] dark:text-foreground"
        dangerouslySetInnerHTML={{ __html: promptText }}
        data-testid="text-prompt-preview"
      />
    );
  };

  return (
    <Card className="p-6 sm:p-8 rounded-xl shadow-lg" data-testid="card-storyboard">
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <h2 className="font-heading font-semibold text-2xl text-[#2C3E50] dark:text-foreground" data-testid="heading-storyboard">
              Writing {story.characterName}'s Story
            </h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-[#2C3E50]/60 dark:text-muted-foreground" data-testid="text-progress">
            Section {story.sections.length + 1} of 5
          </div>
        </div>

        {story.sections.length > 0 && (
          <div className="space-y-4 border-b border-border pb-6">
            <h3 className="font-heading font-medium text-lg text-[#2C3E50] dark:text-foreground">
              Story So Far
            </h3>
            <div className="space-y-4 max-h-60 overflow-y-auto pr-2">
              {story.sections.map((section, idx) => (
                <div 
                  key={idx} 
                  className="p-4 bg-muted/50 rounded-lg"
                  data-testid={`section-${section.sectionNumber}`}
                >
                  <p className="text-[#2C3E50] dark:text-foreground leading-relaxed">
                    {section.generatedText}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {generatePromptMutation.isPending && (
          <div className="flex flex-col items-center justify-center py-12 gap-4" data-testid="loading-prompt">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <p className="text-[#2C3E50]/70 dark:text-muted-foreground font-medium">
              Crafting the next part of your story...
            </p>
          </div>
        )}

        {currentPrompt && !generatePromptMutation.isPending && (
          <div className="space-y-6">
            <div className="p-4 bg-accent/10 rounded-xl border border-accent/20">
              {renderPromptWithBlanks()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentPrompt.blanks.map((blank: BlankField) => (
                <div key={blank.key} className="space-y-2">
                  <Label 
                    htmlFor={blank.key}
                    className="text-[#2C3E50] dark:text-foreground font-medium"
                  >
                    {blank.label}
                  </Label>
                  <Input
                    id={blank.key}
                    placeholder={blank.placeholder}
                    value={userInputs[blank.key] || ""}
                    onChange={(e) => handleInputChange(blank.key, e.target.value)}
                    className="h-11 rounded-lg"
                    disabled={isLoading}
                    data-testid={`input-blank-${blank.key}`}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => submitSectionMutation.mutate()}
                disabled={!allInputsFilled || isLoading}
                className="flex-1 h-12 rounded-xl font-heading font-medium"
                data-testid="button-keep-writing"
              >
                {submitSectionMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : story.sections.length >= 4 ? (
                  <>
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Complete Story
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-5 h-5 mr-2" />
                    Keep Writing
                  </>
                )}
              </Button>

              {story.sections.length > 0 && (
                <Button
                  onClick={() => redoSectionMutation.mutate()}
                  disabled={isLoading}
                  variant="outline"
                  className="h-12 rounded-xl font-heading font-medium"
                  data-testid="button-redo-section"
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Redo Last Section
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
