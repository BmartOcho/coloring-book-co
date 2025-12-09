import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { BookOpen, Clock, Download, Home, Loader2, Mail, CheckCircle, AlertCircle } from "lucide-react";

interface OrderDetails {
  id: string;
  status: string;
  email: string;
  totalPages: number;
  pagesGenerated: number;
  pdfUrl: string | null;
  story: {
    characterName: string;
    storyType: string;
  } | null;
}

export default function OrderStatusPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const response = await fetch(`/api/orders/${params.id}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Order not found");
          }
          throw new Error("Failed to fetch order");
        }
        const data = await response.json();
        setOrder(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (params.id) {
      fetchOrder();
      const interval = setInterval(fetchOrder, 10000);
      return () => clearInterval(interval);
    }
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
          <h2 className="font-heading text-xl font-semibold text-foreground">
            Loading order...
          </h2>
        </Card>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
            Order Not Found
          </h2>
          <p className="text-muted-foreground mb-6">
            {error || "We couldn't find this order. Please check your email for the order confirmation."}
          </p>
          <Link href="/">
            <Button variant="outline" data-testid="button-go-home">
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const progressPercent = order.totalPages > 0 
    ? Math.round((order.pagesGenerated / order.totalPages) * 100) 
    : 0;
  
  const isComplete = order.status === "completed" || order.status === "delivered";
  const isGenerating = order.status === "generating";
  const isPaid = order.status === "paid";

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="p-8 max-w-lg w-full" data-testid="card-order-status">
        <div className="space-y-6">
          <div className="text-center">
            {isComplete ? (
              <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600 dark:text-green-400" />
            ) : (
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-primary" />
            )}
            
            <h1 className="font-heading text-2xl font-bold text-foreground mb-2" data-testid="heading-order-status">
              {isComplete 
                ? "Your Coloring Book is Ready!"
                : isGenerating
                  ? "Creating Your Coloring Book..."
                  : "Order Received"
              }
            </h1>
            
            <p className="text-muted-foreground">
              {order.story?.characterName}'s Coloring Book
            </p>
          </div>

          <div className="space-y-4 p-4 bg-muted/50 rounded-xl">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Delivery Email</p>
                <p className="font-medium text-foreground" data-testid="text-email">
                  {order.email}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="font-medium text-foreground capitalize" data-testid="text-status">
                  {order.status === "generating" 
                    ? "Generating illustrations..."
                    : order.status === "paid"
                      ? "Queued for generation"
                      : order.status
                  }
                </p>
              </div>
            </div>
          </div>

          {(isGenerating || isPaid) && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium text-foreground">
                  {order.pagesGenerated} / {order.totalPages} pages
                </span>
              </div>
              <Progress value={progressPercent} className="h-3" data-testid="progress-generation" />
              <p className="text-xs text-center text-muted-foreground">
                This page updates automatically every 10 seconds
              </p>
            </div>
          )}

          {isComplete && order.pdfUrl && (
            <a href={order.pdfUrl} target="_blank" rel="noopener noreferrer">
              <Button 
                className="w-full h-12 rounded-xl font-heading font-semibold bg-primary hover:bg-primary/90 text-white"
                data-testid="button-download"
              >
                <Download className="w-5 h-5 mr-2" />
                Download Your Coloring Book
              </Button>
            </a>
          )}

          {!isComplete && (
            <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
              <p className="text-sm text-muted-foreground text-center">
                We'll email you at <strong>{order.email}</strong> as soon as your coloring book is ready to download.
              </p>
            </div>
          )}

          <Link href="/">
            <Button 
              variant="outline" 
              className="w-full h-11 rounded-lg font-heading"
              data-testid="button-create-another"
            >
              <Home className="w-4 h-4 mr-2" />
              Create Another Story
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
