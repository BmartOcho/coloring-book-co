import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import Home from "@/pages/home";
import NotFound from "@/pages/not-found";
import OrderSuccessPage from "@/pages/order-success";
import OrderStatusPage from "@/pages/order-status";
import OrderCancelPage from "@/pages/order-cancel";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/order/:id/success" component={OrderSuccessPage} />
      <Route path="/order/:id/cancel" component={OrderCancelPage} />
      <Route path="/order/:id" component={OrderStatusPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
