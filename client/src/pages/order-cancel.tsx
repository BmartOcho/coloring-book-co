import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { XCircle, Home, RotateCcw } from "lucide-react";

export default function OrderCancelPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="p-8 max-w-md w-full text-center" data-testid="card-order-cancel">
        <XCircle className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
        
        <h1 className="font-heading text-2xl font-bold text-foreground mb-2" data-testid="heading-cancel">
          Payment Cancelled
        </h1>
        
        <p className="text-muted-foreground mb-6">
          Your payment was not completed. Don't worry - your story is still saved and you can try again anytime.
        </p>

        <div className="flex flex-col gap-3">
          <Link href="/">
            <Button 
              className="w-full h-11 rounded-lg font-heading bg-primary hover:bg-primary/90 text-white"
              data-testid="button-try-again"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Try Again
            </Button>
          </Link>
          
          <Link href="/">
            <Button 
              variant="outline" 
              className="w-full h-11 rounded-lg font-heading"
              data-testid="button-go-home"
            >
              <Home className="w-4 h-4 mr-2" />
              Return Home
            </Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
