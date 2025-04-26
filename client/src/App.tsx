import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import { ThemeProvider } from "@/lib/theme-provider";

import HomePage from "@/pages/home-page";
import DashboardPage from "@/pages/dashboard-page";
import OnboardingPage from "@/pages/onboarding-page";
import AuthPage from "@/pages/auth-page";
import PricingPage from "@/pages/pricing-page";
import RefundPolicyPage from "@/pages/refund-policy-page";
import JobSearchTest from "@/pages/job-search-test";
import JobMatchTest from "@/pages/job-match-test";
import WorkableTestPage from "@/pages/workable-test-page";
import WorkableSchemaTest from "@/pages/workable-schema-test";
import ProfilePage from "@/pages/profile-page";
import NotFound from "@/pages/not-found";
import { ProtectedRoute } from "@/lib/protected-route";
import Navbar from "@/components/navbar";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <ProtectedRoute path="/dashboard" component={DashboardPage} />
      <ProtectedRoute path="/onboarding" component={OnboardingPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/pricing" component={PricingPage} />
      <Route path="/refund-policy" component={RefundPolicyPage} />
      <ProtectedRoute path="/job-search-test" component={JobSearchTest} />
      <ProtectedRoute path="/job-match-test" component={JobMatchTest} />
      <ProtectedRoute path="/workable-test" component={WorkableTestPage} />
      <ProtectedRoute path="/workable-schema-test" component={WorkableSchemaTest} />
      <ProtectedRoute path="/profile" component={ProfilePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider>
            <div className="min-h-screen bg-background">
              <Navbar />
              <Toaster />
              <Router />
            </div>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
