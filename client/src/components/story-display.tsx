import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen, Download, RotateCcw, ImageIcon, ShoppingCart, Loader2, Mail, FlaskConical } from "lucide-react";
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
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isTestGenerating, setIsTestGenerating] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleCheckout = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Email required",
        description: "Please enter a valid email address to receive your coloring book.",
        variant: "destructive",
      });
      return;
    }

    setIsCheckingOut(true);
    try {
      const response = await apiRequest("POST", "/api/orders/checkout", {
        storyId: story.id,
        email,
      });
      
      const data = await response.json();
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("Failed to create checkout session");
      }
    } catch (error: any) {
      console.error("Checkout error:", error);
      toast({
        title: "Checkout failed",
        description: error.message || "Unable to start checkout. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleTestGenerate = async () => {
    if (!email || !email.includes("@")) {
      toast({
        title: "Email required",
        description: "Please enter a valid email address to receive your coloring book.",
        variant: "destructive",
      });
      return;
    }

    setIsTestGenerating(true);
    try {
      const response = await apiRequest("POST", "/api/orders/test-generate", {
        storyId: story.id,
        email,
      });
      
      const data = await response.json();
      
      if (data.orderId) {
        toast({
          title: "Test generation started!",
          description: "Redirecting to order status page...",
        });
        setLocation(`/order/${data.orderId}`);
      } else {
        throw new Error("Failed to create test order");
      }
    } catch (error: any) {
      console.error("Test generate error:", error);
      toast({
        title: "Test generation failed",
        description: error.message || "Unable to start test generation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsTestGenerating(false);
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
          {!showCheckout ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <ShoppingCart className="w-6 h-6 text-primary mt-0.5 flex-shrink-0" />
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
                onClick={() => setShowCheckout(true)}
                className="w-full h-12 rounded-xl font-heading font-semibold bg-primary hover:bg-primary/90 text-white"
                data-testid="button-order-book"
              >
                <ShoppingCart className="w-5 h-5 mr-2" />
                Order Coloring Book - $45.00
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
                <Label htmlFor="checkout-email" className="text-[#2C3E50] dark:text-foreground">
                  Email address
                </Label>
                <Input
                  id="checkout-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-lg"
                  disabled={isCheckingOut}
                  data-testid="input-checkout-email"
                />
              </div>
              
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowCheckout(false)}
                  className="h-11 rounded-lg font-heading"
                  disabled={isCheckingOut || isTestGenerating}
                  data-testid="button-cancel-checkout"
                >
                  Cancel
                </Button>
                
                <Button
                  onClick={handleCheckout}
                  disabled={isCheckingOut || isTestGenerating || !email}
                  className="flex-1 h-11 rounded-lg font-heading font-semibold bg-primary hover:bg-primary/90 text-white"
                  data-testid="button-proceed-checkout"
                >
                  {isCheckingOut ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-5 h-5 mr-2" />
                      Proceed to Payment
                    </>
                  )}
                </Button>
              </div>
              
              <div className="pt-3 border-t border-border/50">
                <Button
                  onClick={handleTestGenerate}
                  disabled={isCheckingOut || isTestGenerating || !email}
                  variant="outline"
                  className="w-full h-11 rounded-lg font-heading border-dashed"
                  data-testid="button-test-generate"
                >
                  {isTestGenerating ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Starting test...
                    </>
                  ) : (
                    <>
                      <FlaskConical className="w-5 h-5 mr-2" />
                      Test Generate (Skip Payment)
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  For testing purposes only - bypasses payment
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
