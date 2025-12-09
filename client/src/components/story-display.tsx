import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Download, RotateCcw, ImageIcon } from "lucide-react";
import type { Story } from "@shared/schema";

interface StoryDisplayProps {
  story: Story;
  onReset: () => void;
}

export function StoryDisplay({ story, onReset }: StoryDisplayProps) {
  const handleDownloadStory = () => {
    const storyText = story.sections
      .map((section, idx) => `Chapter ${idx + 1}\n\n${section.generatedText}`)
      .join("\n\n---\n\n");

    const fullText = `${story.characterName}'s Adventure\n\n${"=".repeat(40)}\n\n${storyText}`;

    const blob = new Blob([fullText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${story.characterName}-story.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="p-6 sm:p-8 rounded-xl shadow-lg" data-testid="card-story-complete">
      <div className="space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen className="w-6 h-6 text-[#95E1D3]" />
          <h2 className="font-heading font-semibold text-2xl text-[#2C3E50] dark:text-foreground" data-testid="heading-story-complete">
            {story.characterName}'s Story is Ready!
          </h2>
        </div>

        <div className="flex items-center gap-4 p-4 bg-[#95E1D3]/20 rounded-xl border border-[#95E1D3]/30">
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
            {story.characterImageData && (
              <img
                src={story.characterImageData}
                alt={story.characterName}
                className="w-full h-full object-cover"
                data-testid="img-character-thumbnail"
              />
            )}
          </div>
          <div>
            <h3 className="font-heading font-medium text-lg text-[#2C3E50] dark:text-foreground">
              {story.characterName}
            </h3>
            <p className="text-sm text-[#2C3E50]/60 dark:text-muted-foreground">
              {story.sections.length} chapters written
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-heading font-medium text-lg text-[#2C3E50] dark:text-foreground flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Your Complete Story
          </h3>
          
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {story.sections.map((section, idx) => (
              <div 
                key={idx}
                className="p-4 bg-muted/50 rounded-lg border-l-4 border-primary"
                data-testid={`complete-section-${idx + 1}`}
              >
                <p className="text-sm font-medium text-primary mb-2">
                  Chapter {idx + 1}
                </p>
                <p className="text-[#2C3E50] dark:text-foreground leading-relaxed">
                  {section.generatedText}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-border">
          <Button
            onClick={handleDownloadStory}
            className="flex-1 h-12 rounded-xl font-heading font-medium bg-accent hover:bg-accent/90 text-[#2C3E50]"
            data-testid="button-download-story"
          >
            <Download className="w-5 h-5 mr-2" />
            Download Story
          </Button>
          
          <Button
            onClick={onReset}
            variant="outline"
            className="h-12 rounded-xl font-heading font-medium"
            data-testid="button-create-another"
          >
            <RotateCcw className="w-5 h-5 mr-2" />
            Create Another Story
          </Button>
        </div>

        <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
          <p className="text-sm text-[#2C3E50]/70 dark:text-muted-foreground">
            <strong className="text-primary">Coming Soon:</strong> Purchase your complete 25-page custom coloring book with professionally printed pages, perfect bound, and shipped to your door!
          </p>
        </div>
      </div>
    </Card>
  );
}
