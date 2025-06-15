/**
 * Plan Restriction Modal Component
 * Shows upgrade prompts when users hit plan limitations
 */

import React from "react";
import { AlertTriangle, Crown, Zap, Shield, CheckCircle } from "lucide-react";
import { Button } from "./button";

interface PlanRestrictionModalProps {
  isOpen: boolean;
  onClose: () => void;
  restriction: {
    type: "AI_MODEL" | "FEATURE" | "DAILY_LIMIT";
    currentPlan: string;
    message: string;
    restrictedFeature?: string;
    restrictedModel?: string;
  };
  onUpgrade?: () => void;
}

const PLAN_FEATURES = {
  "FREE": {
    ai_models: [],
    ai_systems: [],
    daily_limit: 5,
    color: "gray"
  },
  "two_weeks": {
    ai_models: ["ChatGPT 4o-mini"],
    ai_systems: ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking"],
    daily_limit: 20,
    color: "blue"
  },
  "one_month_silver": {
    ai_models: ["ChatGPT 4o-mini"],
    ai_systems: ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking"],
    daily_limit: 40,
    color: "gray"
  },
  "one_month_gold": {
    ai_models: ["ChatGPT 4o", "Claude 3.7 Sonnet"],
    ai_systems: ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking", "24/7 Application AI Reliability"],
    daily_limit: 100,
    color: "yellow"
  },
  "three_months_gold": {
    ai_models: ["ChatGPT 4o", "Claude 3.7 Sonnet"],
    ai_systems: ["AI Resume Enhancement", "Personalized Cover Letters", "Application Tracking", "24/7 Application AI Reliability"],
    daily_limit: 100,
    color: "yellow"
  }
};

export function PlanRestrictionModal({ 
  isOpen, 
  onClose, 
  restriction, 
  onUpgrade 
}: PlanRestrictionModalProps) {
  if (!isOpen) return null;

  const currentPlanFeatures = PLAN_FEATURES[restriction.currentPlan as keyof typeof PLAN_FEATURES];
  const goldFeatures = PLAN_FEATURES["1_MONTH_GOLD"];

  const getUpgradeRecommendation = () => {
    if (restriction.type === "AI_MODEL" && restriction.restrictedModel?.includes("Claude")) {
      return "one_month_gold";
    }
    if (restriction.type === "FEATURE" && restriction.restrictedFeature?.includes("24/7")) {
      return "one_month_gold";
    }
    if (restriction.type === "DAILY_LIMIT") {
      return restriction.currentPlan === "two_weeks" ? "one_month_silver" : "one_month_gold";
    }
    return "one_month_gold";
  };

  const recommendedPlan = getUpgradeRecommendation();
  const recommendedFeatures = PLAN_FEATURES[recommendedPlan as keyof typeof PLAN_FEATURES];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Premium Feature Required
              </h3>
              <p className="text-sm text-gray-600">
                Upgrade to unlock this feature
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Current Limitation */}
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">
              <strong>Current Plan:</strong> {restriction.currentPlan.replace(/_/g, ' ')}
            </p>
            <p className="text-sm text-red-700 mt-1">
              {restriction.message}
            </p>
          </div>

          {/* What you're missing */}
          {restriction.type === "AI_MODEL" && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900 flex items-center">
                <Zap className="h-4 w-4 text-blue-500 mr-2" />
                Premium AI Models
              </h4>
              <div className="text-sm text-gray-600">
                <p>You're trying to access <strong>{restriction.restrictedModel}</strong></p>
                <p className="mt-1">Upgrade to GOLD for access to both ChatGPT 4o and Claude 3.7 Sonnet.</p>
              </div>
            </div>
          )}

          {restriction.type === "FEATURE" && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900 flex items-center">
                <Shield className="h-4 w-4 text-green-500 mr-2" />
                Premium Feature
              </h4>
              <div className="text-sm text-gray-600">
                <p><strong>{restriction.restrictedFeature}</strong> is only available on premium plans.</p>
                {restriction.restrictedFeature?.includes("24/7") && (
                  <p className="mt-1">This ensures your applications continue even if one AI service is down.</p>
                )}
              </div>
            </div>
          )}

          {restriction.type === "DAILY_LIMIT" && (
            <div className="space-y-2">
              <h4 className="font-medium text-gray-900 flex items-center">
                <Crown className="h-4 w-4 text-yellow-500 mr-2" />
                Daily Application Limit
              </h4>
              <div className="text-sm text-gray-600">
                <p>You've reached your daily limit of {currentPlanFeatures?.daily_limit} applications.</p>
                <p className="mt-1">Upgrade for higher daily limits and more features.</p>
              </div>
            </div>
          )}

          {/* Upgrade Benefits */}
          <div className="p-4 bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center">
              <Crown className="h-4 w-4 text-yellow-600 mr-2" />
              Upgrade to {recommendedPlan.replace(/_/g, ' ')} Plan
            </h4>
            
            <div className="space-y-2">
              {/* AI Models */}
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <strong>AI Models:</strong> {recommendedFeatures.ai_models.join(", ")}
                </div>
              </div>
              
              {/* Daily Limit */}
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <strong>Daily Applications:</strong> {recommendedFeatures.daily_limit} per day
                </div>
              </div>
              
              {/* Features */}
              <div className="flex items-start space-x-2">
                <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <strong>Features:</strong> {recommendedFeatures.ai_systems.slice(0, 2).join(", ")}
                  {recommendedFeatures.ai_systems.length > 2 && ", and more"}
                </div>
              </div>
              
              {/* Premium Features */}
              {recommendedFeatures.ai_systems.includes("24/7 Application AI Reliability") && (
                <div className="flex items-start space-x-2">
                  <Shield className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <strong>24/7 AI Reliability:</strong> Automatic fallback between AI models
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Current vs Upgrade Comparison */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-gray-50 rounded-lg">
              <h5 className="font-medium text-gray-900 mb-1">Current Plan</h5>
              <div className="space-y-1 text-gray-600">
                <div>Models: {currentPlanFeatures?.ai_models.length || 0}</div>
                <div>Daily Limit: {currentPlanFeatures?.daily_limit || 0}</div>
                <div>Features: {currentPlanFeatures?.ai_systems.length || 0}</div>
              </div>
            </div>
            
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h5 className="font-medium text-yellow-800 mb-1">Recommended</h5>
              <div className="space-y-1 text-yellow-700">
                <div>Models: {recommendedFeatures.ai_models.length}</div>
                <div>Daily Limit: {recommendedFeatures.daily_limit}</div>
                <div>Features: {recommendedFeatures.ai_systems.length}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 flex space-x-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1"
          >
            Maybe Later
          </Button>
          <Button
            onClick={() => {
              onUpgrade?.();
              onClose();
            }}
            className="flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700"
          >
            <Crown className="h-4 w-4 mr-2" />
            Upgrade Now
          </Button>
        </div>
      </div>
    </div>
  );
} 