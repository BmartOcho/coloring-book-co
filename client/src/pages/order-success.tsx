import { useEffect, useState } from "react";
import { useParams, useSearch, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle, Loader2, Mail, BookOpen, Clock, Home } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface OrderDetails {
  id: string;
  status: string;
  email: string;
  totalPages: number;
  pagesGenerated: number;
  story: {
    characterName: string;
    storyType: string;
  } | null;
}

export default function OrderSuccessPage() {
  const params = useParams<{ id: string }>();
  const searchParams = new URLSearchParams(useSearch());
  const sessionId = searchParams.get("session_id");
  
  const [isVerifying, setIsVerifying] = useState(true);
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        await apiRequest("POST", `/api/orders/${params.id}/verify-payment`);
        
        const orderResponse = await fetch(`/api/orders/${params.id}`);
        if (!orderResponse.ok) {
          throw new Error("Failed to fetch order details");
        }
        const orderData = await orderResponse.json();
        setOrder(orderData);
      } catch (err: any) {
        console.error("Payment verification error:", err);
        setError(err.message || "Failed to verify payment");
      } finally {
        setIsVerifying(false);
      }
    };

    if (params.id) {
      verifyPayment();
    }
  }, [params.id, sessionId]);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="p-8 max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
            Verifying your payment...
          </h2>
          <p className="text-muted-foreground">
            Please wait while we confirm your order.
          </p>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive text-2xl">!</span>
          </div>
          <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
            Something went wrong
          </h2>
          <p className="text-muted-foreground mb-6">{error}</p>
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="p-8 max-w-lg w-full" data-testid="card-order-success">
        <div className="text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
          </div>
          
          <div>
            <h1 className="font-heading text-2xl font-bold text-foreground mb-2" data-testid="heading-success">
              Payment Successful!
            </h1>
            <p className="text-muted-foreground">
              Thank you for your order. We're creating your personalized coloring book now.
            </p>
          </div>

          {order && (
            <div className="text-left space-y-4 p-4 bg-muted/50 rounded-xl">
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">
                    {order.story?.characterName}'s Coloring Book
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {order.totalPages} pages
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Delivery Email</p>
                  <p className="text-sm text-muted-foreground" data-testid="text-email">
                    {order.email}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-medium text-foreground">Estimated Delivery</p>
                  <p className="text-sm text-muted-foreground">
                    Within 30 minutes
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 bg-primary/5 rounded-xl border border-primary/20">
            <p className="text-sm text-muted-foreground">
              We're generating custom illustrations for each page of your story. 
              You'll receive an email at <strong>{order?.email}</strong> with a download link when your coloring book is ready.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Link href="/" className="flex-1">
              <Button 
                variant="outline" 
                className="w-full h-11 rounded-lg font-heading"
                data-testid="button-create-another"
              >
                <Home className="w-4 h-4 mr-2" />
                Create Another Story
              </Button>
            </Link>
            
            {order && (
              <Link href={`/order/${order.id}`} className="flex-1">
                <Button 
                  className="w-full h-11 rounded-lg font-heading bg-primary hover:bg-primary/90 text-white"
                  data-testid="button-check-status"
                >
                  <Clock className="w-4 h-4 mr-2" />
                  Check Status
                </Button>
              </Link>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
