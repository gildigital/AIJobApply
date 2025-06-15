/**
 * Plan Validation Middleware
 * Validates user subscription plans and restricts access to premium AI features
 */

import type { Request, Response, NextFunction } from "express";
import { PLAN_CONFIGS, canAccessAIModel, canAccessFeature, getModelForPlan } from "./plan-config.js";
import type { User } from "@shared/schema.js";

// Extend Express Request type to include plan information
declare module "express-serve-static-core" {
  interface Request {
    userPlan?: string;
    planFeatures?: {
      ai_models: string[];
      ai_systems: string[];
      daily_limit: number;
      resumes_allowed: number;
    };
  }
}

/**
 * Middleware to attach user plan information to the request
 */
export function attachPlanInfo(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const user = req.user as User;
    const userPlan = user.subscriptionPlan || "FREE";
    const planFeatures = PLAN_CONFIGS[userPlan];
    
    req.userPlan = userPlan;
    req.planFeatures = planFeatures;
    
    console.log(`🎫 User plan attached: ${userPlan} with features:`, planFeatures?.ai_models);
  }
  
  next();
}

/**
 * Middleware to validate if user can access AI features
 */
export function requireAIAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  
  const userPlan = req.userPlan || "FREE";
  const planFeatures = req.planFeatures;
  
  if (!planFeatures || planFeatures.ai_models.length === 0) {
    return res.status(403).json({ 
      message: "AI features not available on your current plan",
      plan: userPlan,
      upgrade_required: true
    });
  }
  
  next();
}

/**
 * Middleware to validate access to specific AI models
 */
export function requireAIModel(modelName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const userPlan = req.userPlan || "FREE";
    
    if (!canAccessAIModel(userPlan, modelName)) {
      return res.status(403).json({ 
        message: `Access to ${modelName} requires a premium plan`,
        current_plan: userPlan,
        required_plan: "GOLD",
        upgrade_required: true
      });
    }
    
    next();
  };
}

/**
 * Middleware to validate access to premium features
 */
export function requirePremiumFeature(featureName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    const userPlan = req.userPlan || "FREE";
    
    if (!canAccessFeature(userPlan, featureName)) {
      return res.status(403).json({ 
        message: `${featureName} requires a premium plan`,
        current_plan: userPlan,
        available_plans: ["1_MONTH_GOLD", "3_MONTHS_GOLD"],
        upgrade_required: true
      });
    }
    
    next();
  };
}

/**
 * Middleware to add plan-appropriate model selection to response
 */
export function addModelInfo(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    const userPlan = req.userPlan || "FREE";
    const availableModels = PLAN_CONFIGS[userPlan]?.ai_models || [];
    const primaryModel = getModelForPlan(userPlan, "primary");
    
    // Add to response locals for use in route handlers
    res.locals.availableModels = availableModels;
    res.locals.primaryModel = primaryModel;
    res.locals.userPlan = userPlan;
  }
  
  next();
}

/**
 * Utility function to check if request has required plan level
 */
export function hasPlanLevel(req: Request, requiredLevel: "SILVER" | "GOLD"): boolean {
  const userPlan = req.userPlan || "FREE";
  
  switch (requiredLevel) {
    case "SILVER":
      return ["1_MONTH_SILVER", "2_WEEKS", "1_MONTH_GOLD", "3_MONTHS_GOLD"].includes(userPlan);
    case "GOLD":
      return ["1_MONTH_GOLD", "3_MONTHS_GOLD"].includes(userPlan);
    default:
      return false;
  }
}

/**
 * Express error handler for plan-related errors
 */
export function handlePlanErrors(error: any, req: Request, res: Response, next: NextFunction) {
  if (error.type === "PLAN_RESTRICTION") {
    return res.status(403).json({
      message: error.message,
      plan_restriction: true,
      current_plan: req.userPlan || "FREE",
      upgrade_required: true,
      available_upgrades: error.available_upgrades || ["1_MONTH_GOLD", "3_MONTHS_GOLD"]
    });
  }
  
  if (error.type === "AI_MODEL_RESTRICTED") {
    return res.status(403).json({
      message: error.message,
      ai_model_restriction: true,
      current_plan: req.userPlan || "FREE",
      restricted_model: error.model,
      upgrade_required: true
    });
  }
  
  next(error);
} 