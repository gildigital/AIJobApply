import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import LandingPage from "@/components/landing-page";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  if (isLoading) {
    return null;
  }

  if (user) {
    // Redirect to dashboard or onboarding
    if (user.onboardingCompleted) {
      setLocation("/dashboard");
    } else {
      setLocation("/onboarding");
    }
    return null;
  }

  return <LandingPage />;
}
