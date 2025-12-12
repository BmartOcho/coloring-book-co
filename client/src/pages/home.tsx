import { useState } from "react";
import { Upload, Download, Loader2, CheckCircle, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { ImageConversionResponse } from "@shared/schema";

type AppPhase = "upload" | "preview" | "converted";
type DetailLevel = "1" | "2";

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [originalPreview, setOriginalPreview] = useState<string>("");
  const [coloringBookImage, setColoringBookImage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [detailLevel, setDetailLevel] = useState<DetailLevel>("1");
  const { toast } = useToast();

  const convertMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });

      const response = await apiRequest("POST", "/api/convert", {
        imageData: base64,
        fileName: file.name,
        detailLevel: detailLevel,
      });

      const data: ImageConversionResponse = await response.json();
      return data;
    },
    onSuccess: (data) => {
      setColoringBookImage(data.coloringBookImage);
      setPhase("converted");
      toast({
        title: "Ready to download!",
        description: "Your coloring book page is ready.",
        className: "bg-[#95E1D3] border-[#95E1D3] text-[#2C3E50]",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Conversion failed",
        description: error.message || "Please try again with a different image.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, or WEBP).",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 50MB.",
        variant: "destructive",
      });
      return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      if (img.width < 64 || img.height < 64) {
        toast({
          title: "Image too small",
          description: "Please upload an image at least 64x64 pixels.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      setColoringBookImage("");
      setPhase("preview");

      const reader = new FileReader();
      reader.onloadend = () => {
        setOriginalPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      toast({
        title: "Invalid image",
        description: "Could not read the image file. Please try another.",
        variant: "destructive",
      });
    };

    img.src = objectUrl;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleConvert = () => {
    if (selectedFile) {
      convertMutation.mutate(selectedFile);
    }
  };

  const handleDownload = async () => {
    if (!coloringBookImage) return;

    try {
      const response = await apiRequest("POST", "/api/convert-pdf", {
        imageData: coloringBookImage,
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "coloring-book-" + Date.now() + ".pdf";
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);

      toast({
        title: "Downloaded!",
        description: "Your coloring page PDF has been saved.",
        className: "bg-[#95E1D3] border-[#95E1D3] text-[#2C3E50]",
      });
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleNewImage = () => {
    setSelectedFile(null);
    setOriginalPreview("");
    setColoringBookImage("");
    setPhase("upload");
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex justify-end mb-6">
          <ThemeToggle />
        </div>

        <div className="text-center mb-12">
          <h1 className="font-heading font-semibold text-4xl sm:text-5xl text-[#2C3E50] dark:text-foreground mb-4" data-testid="heading-main">
            Photo to Coloring Book
          </h1>
          <p className="font-sans text-lg text-[#2C3E50]/70 dark:text-muted-foreground max-w-2xl mx-auto" data-testid="text-subtitle">
            Transform your photos into beautiful cartoon-style coloring pages with AI
          </p>
        </div>

        {phase === "upload" && (
          <div className="max-w-2xl mx-auto">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-200
                min-h-[400px] flex flex-col items-center justify-center p-8 sm:p-12
                ${isDragging
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-primary/50 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10"
                }
              `}
              data-testid="upload-zone"
            >
              <input
                type="file"
                accept="image/*"
                onChange={handleFileInputChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                data-testid="input-file"
              />

              <div className="flex flex-col items-center gap-6 pointer-events-none">
                <div className="relative">
                  <div className="absolute inset-0 bg-accent/20 dark:bg-accent/10 rounded-full blur-2xl"></div>
                  <Upload className="relative w-16 h-16 sm:w-20 sm:h-20 text-accent dark:text-accent" />
                </div>

                <div className="text-center space-y-2">
                  <p className="font-heading font-medium text-xl sm:text-2xl text-[#2C3E50] dark:text-foreground" data-testid="text-upload-primary">
                    Drag & drop your photo here
                  </p>
                  <p className="font-sans text-base text-[#2C3E50]/60 dark:text-muted-foreground" data-testid="text-upload-secondary">
                    or click to browse
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-[#2C3E50]/50 dark:text-muted-foreground" data-testid="text-file-formats">
                  <span className="px-3 py-1 rounded-full bg-background dark:bg-card border border-border" data-testid="badge-png">PNG</span>
                  <span className="px-3 py-1 rounded-full bg-background dark:bg-card border border-border" data-testid="badge-jpg">JPG</span>
                  <span className="px-3 py-1 rounded-full bg-background dark:bg-card border border-border" data-testid="badge-webp">WEBP</span>
                  <span className="px-3 py-1 rounded-full bg-background dark:bg-card border border-border" data-testid="badge-size">Up to 50MB</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {(phase === "preview" || phase === "converted") && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <Card className="p-6 rounded-xl shadow-lg" data-testid="card-original">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <ImageIcon className="w-5 h-5 text-[#2C3E50]/60 dark:text-muted-foreground" />
                    <h2 className="font-heading font-semibold text-xl text-[#2C3E50] dark:text-foreground">Original Photo</h2>
                  </div>
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                    {originalPreview && (
                      <img src={originalPreview} alt="Original uploaded photo" className="w-full h-full object-contain" data-testid="img-original" />
                    )}
                  </div>
                </div>
              </Card>

              <Card className="p-6 rounded-xl shadow-lg" data-testid="card-converted">
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <ImageIcon className="w-5 h-5 text-[#2C3E50]/60 dark:text-muted-foreground" />
                    <h2 className="font-heading font-semibold text-xl text-[#2C3E50] dark:text-foreground">Coloring Book Version</h2>
                  </div>
                  <div className="relative aspect-square rounded-xl overflow-hidden bg-muted">
                    {convertMutation.isPending && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/95 dark:bg-card/95" data-testid="loading-state">
                        <Loader2 className="w-12 h-12 text-accent dark:text-accent animate-spin" />
                        <p className="font-sans text-[#2C3E50] dark:text-foreground font-medium">Creating your coloring book...</p>
                      </div>
                    )}
                    {coloringBookImage && !convertMutation.isPending && (
                      <img src={coloringBookImage} alt="Converted coloring book image" className="w-full h-full object-contain" data-testid="img-converted" />
                    )}
                    {!coloringBookImage && !convertMutation.isPending && (
                      <div className="absolute inset-0 flex items-center justify-center text-[#2C3E50]/40 dark:text-muted-foreground">
                        <p className="font-sans">Preview will appear here</p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>

            {phase === "preview" && (
              <div className="space-y-6">
                <Card className="p-6 rounded-xl shadow-md bg-muted/30 dark:bg-muted/20">
                  <div className="space-y-4">
                    <Label className="font-heading font-semibold text-lg text-[#2C3E50] dark:text-foreground" data-testid="label-detail-level">
                      Coloring Complexity Level
                    </Label>
                    <RadioGroup value={detailLevel} onValueChange={(value) => setDetailLevel(value as DetailLevel)}>
                      <div className="flex items-center space-x-3" data-testid="radio-level-1">
                        <RadioGroupItem value="1" id="level-1" />
                        <Label htmlFor="level-1" className="font-sans text-base cursor-pointer flex-1">
                          <span className="font-medium text-[#2C3E50] dark:text-foreground">Simple</span>
                          <p className="text-sm text-[#2C3E50]/60 dark:text-muted-foreground">Bold lines, easy for young children</p>
                        </Label>
                      </div>
                      <div className="flex items-center space-x-3" data-testid="radio-level-2">
                        <RadioGroupItem value="2" id="level-2" />
                        <Label htmlFor="level-2" className="font-sans text-base cursor-pointer flex-1">
                          <span className="font-medium text-[#2C3E50] dark:text-foreground">Complex</span>
                          <p className="text-sm text-[#2C3E50]/60 dark:text-muted-foreground">More detail and thinner lines</p>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                </Card>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button onClick={handleConvert} disabled={convertMutation.isPending} className="font-heading font-medium text-base px-8 min-h-12 rounded-xl shadow-md w-full sm:w-auto" data-testid="button-convert">
                    {convertMutation.isPending ? (<><Loader2 className="w-5 h-5 mr-2 animate-spin" />Converting...</>) : ("Convert to Coloring Book")}
                  </Button>
                  <Button onClick={handleNewImage} variant="outline" className="font-heading font-medium text-base px-8 min-h-12 rounded-xl w-full sm:w-auto" data-testid="button-reset">
                    Choose Different Photo
                  </Button>
                </div>
              </div>
            )}

            {phase === "converted" && (
              <>
                <div className="flex items-center justify-center gap-2 text-[#95E1D3]" data-testid="success-message">
                  <CheckCircle className="w-5 h-5" />
                  <p className="font-sans font-medium">Your coloring page is ready!</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button onClick={handleDownload} className="font-heading font-medium text-base px-8 min-h-12 rounded-xl shadow-md w-full sm:w-auto" data-testid="button-download">
                    <Download className="w-5 h-5 mr-2" />
                    Download Coloring Page
                  </Button>
                  <Button onClick={handleNewImage} variant="outline" className="font-heading font-medium text-base px-8 min-h-12 rounded-xl w-full sm:w-auto" data-testid="button-new">
                    Create Another
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
