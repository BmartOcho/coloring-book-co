import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, Download, RotateCcw, ImageIcon, Sparkles, Loader2, Mail } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Story } from "@shared/schema";
import { useLocation } from "wouter";

interface StoryDisplayProps {
  story: Story;
  onReset: () => void;
}

export function StoryDisplay({ story, onReset }: StoryDisplayProps) {
  const [email, setEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleGenerate = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Email required",
        description: "Please enter a valid email address to receive your coloring book.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const response = await apiRequest("POST", "/api/orders/generate", {
        storyId: story.id,
        email,
      });
      
      const data = await response.json();
      
      if (data.orderId) {
        toast({
          title: "Generation started!",
          description: "Redirecting to order status page...",
        });
        setLocation(`/order/${data.orderId}`);
      } else {
        throw new Error("Failed to create order");
      }
    } catch (error: any) {
      console.error("Generate error:", error);
      toast({
        title: "Generation failed",
        description: error.message || "Unable to start generation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

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

        <div className="p-5 bg-gradient-to-r from-primary/10 to-accent/10 rounded-xl border border-primary/20">
          {!showEmailForm ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Sparkles className="w-6 h-6 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-heading font-semibold text-lg text-[#2C3E50] dark:text-foreground">
                    Get Your Personalized Coloring Book!
                  </h3>
                  <p className="text-sm text-[#2C3E50]/70 dark:text-muted-foreground mt-1">
                    Turn {story.characterName}'s story into a beautiful 26-page coloring book with custom illustrations for each chapter.
                  </p>
                </div>
              </div>
              
              <div className="flex flex-wrap items-center gap-3 text-sm text-[#2C3E50]/60 dark:text-muted-foreground">
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-4 h-4" /> 25 custom pages
                </span>
                <span className="flex items-center gap-1">
                  <BookOpen className="w-4 h-4" /> Plus cover
                </span>
                <span className="flex items-center gap-1">
                  <Mail className="w-4 h-4" /> Digital download
                </span>
              </div>
              
              <Button
                onClick={() => setShowEmailForm(true)}
                className="w-full h-12 rounded-xl font-heading font-semibold bg-primary hover:bg-primary/90 text-white"
                data-testid="button-generate-book"
              >
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Coloring Book
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary" />
                <h3 className="font-heading font-semibold text-lg text-[#2C3E50] dark:text-foreground">
                  Enter Your Email
                </h3>
              </div>
              
              <p className="text-sm text-[#2C3E50]/70 dark:text-muted-foreground">
                We'll send your coloring book to this email when it's ready (usually within 30 minutes).
              </p>
              
              <div className="space-y-2">
                <Label htmlFor="generate-email" className="text-[#2C3E50] dark:text-foreground">
                  Email address
                </Label>
                <Input
                  id="generate-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-lg"
                  disabled={isGenerating}
                  data-testid="input-generate-email"
                />
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowEmailForm(false)}
                  className="h-11 rounded-lg font-heading"
                  disabled={isGenerating}
                  data-testid="button-cancel-generate"
                >
                  Cancel
                </Button>
                
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating || !email}
                  className="flex-1 h-11 rounded-lg font-heading font-semibold bg-primary hover:bg-primary/90 text-white"
                  data-testid="button-start-generate"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 mr-2" />
                      Generate Book
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
