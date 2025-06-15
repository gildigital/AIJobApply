/**
 * Plan Configuration Helper
 * Manages AI model access and features based on user subscription plans
 */

export interface PlanFeatures {
  ai_models: string[];
  ai_systems: string[];
  daily_limit: number;
  resumes_allowed: number;
}

export interface PlanConfig {
  [key: string]: PlanFeatures;
}

// Plan definitions matching your current offering
export const PLAN_CONFIGS: PlanConfig = {
  "3_MONTHS_GOLD": {
    "ai_models": [
      "ChatGPT 4o",
      "Claude 3.7 Sonnet"
    ],
    "ai_systems": [
      "AI Resume Enhancement",
      "Personalized Cover Letters", 
      "Application Tracking",
      "24/7 Application AI Reliability"
    ],
    "daily_limit": 100,
    "resumes_allowed": 1
  },
  "1_MONTH_GOLD": {
    "ai_models": [
      "ChatGPT 4o",
      "Claude 3.7 Sonnet"
    ],
    "ai_systems": [
      "AI Resume Enhancement",
      "Personalized Cover Letters",
      "Application Tracking", 
      "24/7 Application AI Reliability"
    ],
    "daily_limit": 100,
    "resumes_allowed": 1
  },
  "1_MONTH_SILVER": {
    "ai_models": [
      "ChatGPT 4o-mini"
    ],
    "ai_systems": [
      "AI Resume Enhancement",
      "Personalized Cover Letters",
      "Application Tracking"
    ],
    "daily_limit": 40,
    "resumes_allowed": 1
  },
  "2_WEEKS": {
    "ai_models": [
      "ChatGPT 4o-mini"
    ],
    "ai_systems": [
      "AI Resume Enhancement", 
      "Personalized Cover Letters",
      "Application Tracking"
    ],
    "daily_limit": 20,
    "resumes_allowed": 1
  }
};

/**
 * Get plan configuration for a specific plan
 */
export function getPlanConfig(planName: string): PlanFeatures | null {
  return PLAN_CONFIGS[planName] || null;
}

/**
 * Check if a plan has access to a specific AI model
 */
export function hasAIModelAccess(planName: string, modelName: string): boolean {
  const plan = getPlanConfig(planName);
  if (!plan) return false;
  
  // Map model names to plan-friendly names
  const modelMapping: { [key: string]: string } = {
    'gpt-4': 'ChatGPT 4o',
    'gpt-4o': 'ChatGPT 4o', 
    'gpt-4o-mini': 'ChatGPT 4o-mini',
    'claude-3-7-sonnet-20250219': 'Claude 3.7 Sonnet',
    'claude-3.7-sonnet': 'Claude 3.7 Sonnet'
  };
  
  const friendlyModelName = modelMapping[modelName] || modelName;
  return plan.ai_models.includes(friendlyModelName);
}

/**
 * Check if a plan has 24/7 AI reliability (fallback system)
 */
export function hasAIReliability(planName: string): boolean {
  const plan = getPlanConfig(planName);
  if (!plan) return false;
  
  return plan.ai_systems.includes("24/7 Application AI Reliability");
}

/**
 * Get the primary AI model for a plan (first in the list)
 */
export function getPrimaryAIModel(planName: string): string | null {
  const plan = getPlanConfig(planName);
  if (!plan || plan.ai_models.length === 0) return null;
  
  // Map plan-friendly names back to technical model names
  const reverseModelMapping: { [key: string]: string } = {
    'ChatGPT 4o': 'gpt-4o',
    'ChatGPT 4o-mini': 'gpt-4o-mini', 
    'Claude 3.7 Sonnet': 'claude-3-7-sonnet-20250219'
  };
  
  const friendlyName = plan.ai_models[0];
  return reverseModelMapping[friendlyName] || friendlyName;
}

/**
 * Get available AI models for a plan (mapped to technical names)
 */
export function getAvailableAIModels(planName: string): string[] {
  const plan = getPlanConfig(planName);
  if (!plan) return [];
  
  const reverseModelMapping: { [key: string]: string } = {
    'ChatGPT 4o': 'gpt-4o',
    'ChatGPT 4o-mini': 'gpt-4o-mini',
    'Claude 3.7 Sonnet': 'claude-3-7-sonnet-20250219'
  };
  
  return plan.ai_models.map(friendlyName => 
    reverseModelMapping[friendlyName] || friendlyName
  );
}

/**
 * Validate if a plan exists and is valid
 */
export function isValidPlan(planName: string): boolean {
  return planName in PLAN_CONFIGS;
}

/**
 * Check if a plan can access a specific AI model (alias for hasAIModelAccess)
 */
export function canAccessAIModel(planName: string, modelName: string): boolean {
  return hasAIModelAccess(planName, modelName);
}

/**
 * Check if a plan can access a specific feature
 */
export function canAccessFeature(planName: string, featureName: string): boolean {
  const plan = getPlanConfig(planName);
  if (!plan) return false;
  
  return plan.ai_systems.includes(featureName);
}

/**
 * Get the appropriate model for a plan (primary or fallback)
 */
export function getModelForPlan(planName: string, modelType: "primary" | "fallback"): string | null {
  const plan = getPlanConfig(planName);
  if (!plan || plan.ai_models.length === 0) return null;
  
  const reverseModelMapping: { [key: string]: string } = {
    'ChatGPT 4o': 'gpt-4o',
    'ChatGPT 4o-mini': 'gpt-4o-mini', 
    'Claude 3.7 Sonnet': 'claude-3-7-sonnet-20250219'
  };
  
  if (modelType === "primary") {
    const friendlyName = plan.ai_models[0];
    return reverseModelMapping[friendlyName] || friendlyName;
  } else if (modelType === "fallback" && plan.ai_models.length > 1) {
    const friendlyName = plan.ai_models[1];
    return reverseModelMapping[friendlyName] || friendlyName;
  }
  
  return null;
} 