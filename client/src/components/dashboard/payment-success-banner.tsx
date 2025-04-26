import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, X } from "lucide-react";

export function PaymentSuccessBanner() {
  const [visible, setVisible] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [location] = useLocation();
  const { toast } = useToast();
  
  useEffect(() => {
    // Check for payment success in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const planId = urlParams.get('plan');
    
    if (paymentStatus === 'success' && planId) {
      setVisible(true);
      setPlan(planId);
      
      // Show toast
      toast({
        title: "Payment Successful",
        description: "Your subscription has been activated!",
      });
      
      // Clean URL
      const cleanUrl = location.split('?')[0];
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [location, toast]);
  
  if (!visible) {
    return null;
  }
  
  // Get a readable plan name
  const getPlanName = (planId: string) => {
    switch (planId) {
      case "two_weeks":
        return "2 Weeks";
      case "one_month_silver":
        return "1 Month Silver";
      case "one_month_gold":
        return "1 Month Gold";
      case "three_months_gold":
        return "3 Months Gold";
      default:
        return planId;
    }
  };

  return (
    <Card className="mb-6 p-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-500 mt-0.5" />
          <div>
            <h3 className="font-semibold text-green-800 dark:text-green-300">
              Your {getPlanName(plan!)} subscription is now active!
            </h3>
            <p className="text-sm text-green-700 dark:text-green-400 mt-1">
              You can now access all premium features. Thank you for your support!
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 rounded-full text-green-700 dark:text-green-400"
          onClick={() => setVisible(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
      </div>
    </Card>
  );
}