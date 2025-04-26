import { useState } from "react";
import { Check, Zap, Award, FileText, Bot, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { subscriptionPlans } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

// Make sure to call loadStripe outside of a component's render to avoid
// recreating the Stripe object on every render.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

// Add features and isPopular flag to the plans
const enhancedPlans = subscriptionPlans
  .filter(plan => plan.id !== "FREE") // Exclude the free plan
  .map(plan => ({
    ...plan,
    features: plan.priority
      ? [
          "AI Resume Enhancement",
          "Personalized Cover Letters",
          "Application Tracking",
          "24/7 AI Assistant"
        ]
      : [
          "AI Resume Enhancement",
          "Personalized Cover Letters",
          "Application Tracking"
        ],
    isPopular: plan.id === "one_month_gold"
  }))
  .sort((a, b) => {
    // Sort to match the original order: 3 months, 1 month gold, 1 month silver, 2 weeks
    if (a.id === "three_months_gold") return -3;
    if (a.id === "one_month_gold") return -2;
    if (a.id === "one_month_silver") return -1;
    return 0;
  });

interface PlanProps {
  id: string;
  name: string;
  price: string;
  duration: string;
  totalPrice: string;
  features: string[];
  aiModel: string;
  resumeLimit: number;
  dailyLimit: number;
  priority: boolean;
  isPopular?: boolean;
  isSelected?: boolean;
  onSelect: (planId: string) => void;
}

const PlanCard = ({
  id,
  name,
  price,
  duration,
  totalPrice,
  features,
  aiModel,
  resumeLimit,
  dailyLimit,
  priority,
  isPopular = false,
  isSelected = false,
  onSelect,
}: PlanProps) => {
  return (
    <Card className={`relative flex flex-col overflow-hidden ${isSelected ? 'border-2 border-blue-500 shadow-lg' : ''} ${isPopular ? 'md:scale-105 md:z-10' : ''}`}>
      {isPopular && (
        <div className="absolute right-0 top-0">
          <div className="flex items-center gap-1 rounded-bl-lg rounded-tr-lg bg-gradient-to-r from-yellow-400 to-yellow-500 px-3 py-1 text-xs font-medium text-white shadow-sm">
            <Award className="h-3.5 w-3.5" /> MOST POPULAR
          </div>
        </div>
      )}

      <CardHeader className="flex flex-col gap-2 pb-6">
        <CardTitle className="text-xl font-bold">{name}</CardTitle>
        <CardDescription className="text-sm text-gray-500">{duration}</CardDescription>
        <div className="mt-2">
          <span className="text-3xl font-bold">{price}</span>
          <span className="text-sm text-gray-500">/week</span>
        </div>
        <div className="text-sm text-gray-500">{totalPrice} total</div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            <span>{resumeLimit} {resumeLimit === 1 ? "Resume" : "Resumes"}</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-500" />
            <span>Daily limit: up to {dailyLimit} job applications</span>
          </div>
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-500" />
            <span>{aiModel}</span>
          </div>
          {priority && (
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-500" />
              <span>Priority queue applications</span>
            </div>
          )}
        </div>

        <ul className="mt-4 space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-5 w-5 shrink-0 text-green-500" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="pt-4">
        <Button
          variant={isSelected ? "default" : "outline"}
          className="w-full"
          onClick={() => onSelect(id)}
        >
          {isSelected ? "Selected" : "Select Plan"}
        </Button>
      </CardFooter>
    </Card>
  );
};

export default function PricingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [agreeToTerms, setAgreeToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handlePlanSelect = (planId: string) => {
    setSelectedPlan(planId);
  };

  async function handleCheckout() {
    if (!selectedPlan || !agreeToTerms) return;

    try {
      setIsLoading(true);
      
      // Call the new /api/checkout endpoint that will return the checkout URL
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          planId: selectedPlan,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create checkout session");
      }

      const { url } = await response.json();
      
      // Redirect to Stripe Checkout URL directly
      if (url) {
        window.location.href = url;
      } else {
        throw new Error("No checkout URL returned from server");
      }
    } catch (error: any) {
      setIsLoading(false);
      toast({
        title: "Checkout Failed",
        description: error.message || "Something went wrong with the payment process",
        variant: "destructive",
      });
      console.error("Checkout error:", error);
    }
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen pb-20">
      <div className="container mx-auto px-4 py-12">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-extrabold mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            From No Response to Dream Job
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-gray-600 dark:text-gray-300">
            We commit to your career success. If you don't land an interview within 15 days,
            you get your money back.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-4 mb-12">
          {enhancedPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              {...plan}
              isSelected={selectedPlan === plan.id}
              onSelect={handlePlanSelect}
            />
          ))}
        </div>

        <div className="flex flex-col items-center mt-8 mb-12 max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Checkbox 
              id="terms" 
              checked={agreeToTerms} 
              onCheckedChange={(checked) => setAgreeToTerms(checked === true)}
            />
            <label htmlFor="terms" className="text-sm text-gray-700 dark:text-gray-300">
              I agree to <Link href="/refund-policy" className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Use, Refund Policy</Link>.
            </label>
          </div>

          <Button 
            onClick={handleCheckout}
            disabled={!selectedPlan || !agreeToTerms || isLoading}
            className="w-full h-14 text-lg font-medium bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              "Get My Plan"
            )}
          </Button>

          <div className="flex items-center gap-2 mt-4 text-sm text-gray-500 dark:text-gray-400">
            <Shield className="h-4 w-4" />
            <span>Guaranteed safe & secure checkout</span>
            <img src="https://cdn.stripe.com/v/checkout/button-logo@2x.png" alt="Powered by Stripe" className="h-5 ml-1" />
          </div>
        </div>

        <div className="max-w-3xl mx-auto mt-16 text-center">
          <h2 className="text-2xl font-bold mb-6">Why Choose AIJobApply?</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-3 mb-4">
                <Bot className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="font-semibold mb-2">AI-Powered Applications</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Our AI tailors each application to the job description and your skills, increasing your chances.
              </p>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-green-100 dark:bg-green-900 p-3 mb-4">
                <Zap className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <h3 className="font-semibold mb-2">Apply at Scale</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Submit more applications in less time, with each one personalized to stand out to recruiters.
              </p>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="rounded-full bg-purple-100 dark:bg-purple-900 p-3 mb-4">
                <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="font-semibold mb-2">Interview Guarantee</h3>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                Our 15-day interview guarantee means we're confident in our system's ability to get results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}