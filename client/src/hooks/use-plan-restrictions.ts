/**
 * Plan Restrictions Hook
 * Handles API errors related to plan restrictions and shows upgrade modals
 */

import { useState, useCallback } from "react";
import { toast } from "sonner";

interface PlanRestriction {
  type: "AI_MODEL" | "FEATURE" | "DAILY_LIMIT";
  currentPlan: string;
  message: string;
  restrictedFeature?: string;
  restrictedModel?: string;
}

interface PlanRestrictionError {
  message: string;
  plan_restriction?: boolean;
  ai_model_restriction?: boolean;
  current_plan?: string;
  restricted_model?: string;
  upgrade_required?: boolean;
}

export function usePlanRestrictions() {
  const [restriction, setRestriction] = useState<PlanRestriction | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  /**
   * Handle API errors and show plan restriction modals
   */
  const handleApiError = useCallback((error: any) => {
    // Check if it's a plan restriction error
    if (error?.response?.status === 403) {
      const data = error.response.data as PlanRestrictionError;
      
      if (data.plan_restriction || data.ai_model_restriction || data.upgrade_required) {
        // Determine restriction type
        let type: PlanRestriction["type"] = "FEATURE";
        
        if (data.ai_model_restriction) {
          type = "AI_MODEL";
        } else if (data.message?.toLowerCase().includes("daily limit")) {
          type = "DAILY_LIMIT";
        }

        const planRestriction: PlanRestriction = {
          type,
          currentPlan: data.current_plan || "FREE",
          message: data.message || "This feature requires a premium plan",
          restrictedModel: data.restricted_model,
          restrictedFeature: type === "FEATURE" ? extractFeatureName(data.message) : undefined
        };

        setRestriction(planRestriction);
        setIsModalOpen(true);
        
        // Also show a toast for immediate feedback
        toast.error("Premium Feature Required", {
          description: "This feature requires a plan upgrade."
        });
        
        return true; // Indicates we handled the error
      }
    }
    
    return false; // Not a plan restriction error
  }, []);

  /**
   * Extract feature name from error message
   */
  const extractFeatureName = (message: string): string => {
    if (message.includes("24/7")) return "24/7 Application AI Reliability";
    if (message.includes("AI Resume")) return "AI Resume Enhancement";
    if (message.includes("Cover Letter")) return "Personalized Cover Letters";
    if (message.includes("Application Tracking")) return "Application Tracking";
    return "Premium Feature";
  };

  /**
   * Close the restriction modal
   */
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setRestriction(null);
  }, []);

  /**
   * Handle upgrade action
   */
  const handleUpgrade = useCallback(() => {
    // Navigate to pricing page or open upgrade flow
    window.location.href = "/pricing";
  }, []);

  /**
   * Wrapper for API calls that automatically handles plan restrictions
   */
  const withPlanRestrictionHandling = useCallback(<T extends any[], R>(
    apiCall: (...args: T) => Promise<R>
  ) => {
    return async (...args: T): Promise<R> => {
      try {
        return await apiCall(...args);
      } catch (error) {
        const handled = handleApiError(error);
        if (!handled) {
          // Re-throw if not a plan restriction error
          throw error;
        }
        // Return a rejected promise for plan restrictions
        throw error;
      }
    };
  }, [handleApiError]);

  /**
   * Check if current user can access a feature based on common plan patterns
   */
  const canAccessFeature = useCallback((featureName: string, userPlan?: string): boolean => {
    const plan = userPlan || "FREE";
    
    // Simple client-side feature checking (server is the source of truth)
    const PLAN_FEATURES: Record<string, string[]> = {
      "FREE": [],
      "two_weeks": ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking"],
      "one_month_silver": ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking"],
      "one_month_gold": ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking", "24/7 Application AI Reliability"],
      "three_months_gold": ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking", "24/7 Application AI Reliability"]
    };
    
    return PLAN_FEATURES[plan]?.includes(featureName) || false;
  }, []);

  /**
   * Show upgrade prompt for a specific feature
   */
  const showUpgradePrompt = useCallback((featureName: string, currentPlan: string = "FREE") => {
    const planRestriction: PlanRestriction = {
      type: "FEATURE",
      currentPlan,
      message: `${featureName} requires a premium plan`,
      restrictedFeature: featureName
    };

    setRestriction(planRestriction);
    setIsModalOpen(true);
  }, []);

  return {
    // State
    restriction,
    isModalOpen,
    
    // Actions
    handleApiError,
    closeModal,
    handleUpgrade,
    withPlanRestrictionHandling,
    canAccessFeature,
    showUpgradePrompt
  };
} 