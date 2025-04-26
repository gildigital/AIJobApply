import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CreditCard, CheckCircle, AlertCircle, Calendar, Gift, Star } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { SubscriptionPlan, subscriptionPlans } from "@shared/schema";
import { SubscriptionBadge } from "./subscription-badge";
import { Link } from "wouter";
import { Progress } from "@/components/ui/progress";

interface SubscriptionAccessResult {
  allowed: boolean;
  reason?: string;
  remainingApplications: number;
  plan: string;
}

export function SubscriptionManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Find the current plan details
  const currentPlan = subscriptionPlans.find(plan => plan.id === user?.subscriptionPlan) || subscriptionPlans[0];
  
  // Fetch subscription access information
  const { data: subscriptionAccess, isLoading: isAccessLoading } = useQuery<SubscriptionAccessResult>({
    queryKey: ['/api/check-subscription-access'],
    enabled: !!user && user.subscriptionPlan !== 'FREE',
    refetchInterval: 60000, // Refetch every minute to keep usage stats updated
  });
  
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/cancel-subscription");
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Subscription Cancelled",
        description: "Your subscription will be active until the end of your current billing period.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error Cancelling Subscription",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleCancel = () => {
    if (window.confirm("Are you sure you want to cancel your subscription? You'll still have access until the end of your billing period.")) {
      cancelSubscriptionMutation.mutate();
    }
  };
  
  if (!user) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          Your Subscription
          <SubscriptionBadge />
        </CardTitle>
        <CardDescription>
          Manage your subscription plan and billing details
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Plan Features */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Gift className="h-5 w-5 text-blue-500" />
              <div>
                <h3 className="text-sm font-medium">Current Plan</h3>
                <p className="text-base font-semibold">{currentPlan.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-500" />
              <div>
                <h3 className="text-sm font-medium">Price</h3>
                <p className="text-base font-semibold">{currentPlan.price}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-purple-500" />
              <div>
                <h3 className="text-sm font-medium">AI Model</h3>
                <p className="text-base font-semibold">{currentPlan.aiModel}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {currentPlan.priority ? (
                <CheckCircle className="h-5 w-5 text-amber-500" />
              ) : (
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
              )}
              <div>
                <h3 className="text-sm font-medium">Priority Queue</h3>
                <p className="text-base font-semibold">{currentPlan.priority ? "Yes" : "No"}</p>
              </div>
            </div>
          </div>
          
          {/* Usage Stats for Premium users */}
          {user.subscriptionPlan !== "FREE" && (
            <div className="space-y-4 p-4 border rounded-lg">
              <h3 className="font-medium flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" />
                Today's Usage
              </h3>
              
              {isAccessLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Auto Applications</span>
                      <span className="font-medium">
                        {currentPlan.dailyLimit - (subscriptionAccess?.remainingApplications || 0)}/{currentPlan.dailyLimit}
                      </span>
                    </div>
                    <Progress 
                      value={((currentPlan.dailyLimit - (subscriptionAccess?.remainingApplications || 0)) / currentPlan.dailyLimit) * 100} 
                      className="h-2" 
                    />
                  </div>
                  
                  <div className="rounded-md bg-muted p-3 text-sm">
                    {subscriptionAccess?.remainingApplications === 0 ? (
                      <p className="text-amber-600 font-medium">You've reached your daily application limit. This will reset tomorrow.</p>
                    ) : (
                      <p>You have <span className="font-medium">{subscriptionAccess?.remainingApplications || 0}</span> auto-applications remaining today.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          
          {/* Subscription Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {user.subscriptionStartDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-blue-500" />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">Started On</h3>
                  <p className="text-base font-medium">
                    {formatDate(new Date(user.subscriptionStartDate))}
                  </p>
                </div>
              </div>
            )}
            
            {user.subscriptionEndDate && (
              <div className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-amber-500" />
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">
                    {user.subscriptionPlan !== "FREE" && user.stripeSubscriptionId 
                      ? "Renews On" 
                      : "Expires On"}
                  </h3>
                  <p className="text-base font-medium">
                    {formatDate(new Date(user.subscriptionEndDate))}
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {/* Subscription Status */}
          {user.stripeSubscriptionId && (
            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-900">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <p className="text-sm font-medium text-green-700 dark:text-green-300">
                Your subscription is active
              </p>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-3">
        {user.subscriptionPlan === "FREE" ? (
          <Link href="/pricing" className="w-full">
            <Button className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700">
              <Star className="mr-2 h-4 w-4" /> Upgrade to Apply Automatically
            </Button>
          </Link>
        ) : (
          <>
            <div className="flex flex-col w-full sm:flex-row gap-3">
              <Button 
                className="w-full sm:w-auto flex-1"
                variant="outline"
              >
                <CreditCard className="mr-2 h-4 w-4" /> Manage My Billing
              </Button>
              
              <Link href="/pricing" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full">
                  Change Plan
                </Button>
              </Link>
              
              <Button 
                onClick={handleCancel} 
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={cancelSubscriptionMutation.isPending || !user.stripeSubscriptionId}
              >
                {cancelSubscriptionMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  "Cancel Subscription"
                )}
              </Button>
            </div>
          </>
        )}
      </CardFooter>
    </Card>
  );
}