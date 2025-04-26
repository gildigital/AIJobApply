import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import ProgressSteps from "@/components/progress-steps";
import RequiredQuestions from "@/components/onboarding/required-questions";
import DemographicQuestions from "@/components/onboarding/demographic-questions";
import ResumeUpload from "@/components/onboarding/resume-upload";
import { RequiredQuestions as RequiredQuestionsType, DemographicQuestions as DemographicQuestionsType } from "@shared/schema";

export default function OnboardingPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [requiredAnswers, setRequiredAnswers] = useState<RequiredQuestionsType | null>(null);
  const [demographicAnswers, setDemographicAnswers] = useState<DemographicQuestionsType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!user) return null;

  const handleRequiredQuestionsSubmit = async (data: RequiredQuestionsType) => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/onboarding/required-questions", data);
      setRequiredAnswers(data);
      setStep(2);
      toast({
        title: "Progress saved",
        description: "Your required information has been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save required questions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemographicQuestionsSubmit = async (data: DemographicQuestionsType) => {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/onboarding/demographic-questions", data);
      setDemographicAnswers(data);
      setStep(3);
      toast({
        title: "Progress saved",
        description: "Your demographic information has been saved.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save demographic questions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("POST", "/api/complete-onboarding");
      const updatedUser = await response.json();
      queryClient.setQueryData(["/api/user"], updatedUser);
      setLocation("/dashboard");
      toast({
        title: "Onboarding complete",
        description: "Your profile is now complete. Welcome to AIJobApply!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete onboarding. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-4rem)]">
      <div className="max-w-3xl mx-auto pt-10 pb-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 text-center">Complete Your Profile</h2>
          <p className="mt-1 text-sm text-gray-500 text-center">
            Answer these common job application questions once, and we'll use them to help you apply to jobs faster.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <ProgressSteps
            steps={[
              { id: 1, name: "Required Information" },
              { id: 2, name: "Optional Demographics" },
              { id: 3, name: "Resume Upload" }
            ]}
            currentStep={step}
          />
        </div>

        {/* Forms */}
        <Card className="shadow-lg">
          {step === 1 && (
            <RequiredQuestions 
              onSubmit={handleRequiredQuestionsSubmit} 
              isLoading={isLoading}
            />
          )}
          
          {step === 2 && (
            <DemographicQuestions
              onSubmit={handleDemographicQuestionsSubmit}
              onBack={handlePrevStep}
              isLoading={isLoading}
            />
          )}
          
          {step === 3 && (
            <ResumeUpload
              onComplete={handleCompleteOnboarding}
              onBack={handlePrevStep}
              isLoading={isLoading}
            />
          )}
        </Card>
      </div>
    </div>
  );
}
