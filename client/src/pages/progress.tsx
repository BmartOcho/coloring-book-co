import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle, AlertCircle, ArrowLeft, Download } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface OrderProgress {
  id: number;
  email: string;
  status: string;
  currentPage: number;
  totalPages: number;
  generatedImages: string[];
  createdAt: string;
  completedAt: string | null;
}

export default function ProgressPage() {
  const params = useParams();
  const orderId = params.id;

  const { data: order, isLoading, error } = useQuery<OrderProgress>({
    queryKey: ["/api/orders", orderId],
    refetchInterval: (data) => {
      if (data?.state?.data?.status === "completed" || data?.state?.data?.status === "failed") {
        return false;
      }
      return 3000;
    },
  });

  const progressPercentage = order ? (order.currentPage / order.totalPages) * 100 : 0;

  const getStatusDisplay = () => {
    if (!order) return null;

    switch (order.status) {
      case "pending":
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Preparing your coloring book...</span>
          </div>
        );
      case "generating":
        return (
          <div className="flex items-center gap-2 text-primary">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Generating page {order.currentPage} of {order.totalPages}...</span>
          </div>
        );
      case "completed":
        return (
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <CheckCircle className="w-5 h-5" />
            <span>Your coloring book is ready!</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            <span>Generation failed. Please try again.</span>
          </div>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] dark:bg-background flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] dark:bg-background">
        <div className="max-w-4xl mx-auto px-4 py-12">
          <div className="flex justify-end mb-6">
            <ThemeToggle />
          </div>
          <Card className="p-8 text-center" data-testid="card-error">
            <AlertCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h1 className="font-heading font-semibold text-2xl text-foreground mb-2">Order Not Found</h1>
            <p className="text-muted-foreground mb-6">We couldn't find this order. Please check the link and try again.</p>
            <Link href="/">
              <Button data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] dark:bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="flex justify-end mb-6">
          <ThemeToggle />
        </div>

        <div className="text-center mb-8">
          <h1 className="font-heading font-semibold text-3xl sm:text-4xl text-[#2C3E50] dark:text-foreground mb-2" data-testid="heading-progress">
            Your Coloring Book Progress
          </h1>
          <p className="text-muted-foreground" data-testid="text-order-id">Order #{order.id}</p>
        </div>

        <Card className="p-6 sm:p-8 mb-8" data-testid="card-progress">
          <div className="space-y-6">
            <div className="text-center">
              {getStatusDisplay()}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Progress</span>
                <span>{order.currentPage} of {order.totalPages} pages</span>
              </div>
              <Progress value={progressPercentage} className="h-3" data-testid="progress-bar" />
              <p className="text-center text-sm text-muted-foreground">
                {Math.round(progressPercentage)}% complete
              </p>
            </div>

            {order.status === "completed" && (
              <div className="text-center pt-4">
                <p className="text-muted-foreground mb-4">
                  All {order.totalPages} pages have been generated successfully!
                </p>
              </div>
            )}
          </div>
        </Card>

        {order.generatedImages && order.generatedImages.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-heading font-semibold text-xl text-[#2C3E50] dark:text-foreground">
              Generated Pages ({order.generatedImages.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {order.generatedImages.map((image, index) => (
                <Card key={index} className="p-2" data-testid={`card-page-${index}`}>
                  <div className="aspect-[2/3] rounded overflow-hidden bg-muted">
                    <img
                      src={image}
                      alt={`Page ${index + 1}`}
                      className="w-full h-full object-contain"
                      data-testid={`img-page-${index}`}
                    />
                  </div>
                  <p className="text-center text-xs text-muted-foreground mt-2">Page {index + 1}</p>
                </Card>
              ))}
            </div>
          </div>
        )}

        <div className="text-center mt-8">
          <Link href="/">
            <Button variant="outline" data-testid="button-create-another">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Create Another Coloring Book
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
