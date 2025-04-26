import { storage } from "../storage";
import { SubscriptionPlan, subscriptionPlans } from "@shared/schema";

export interface SubscriptionAccessResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Checks if a user has access to premium features based on their subscription plan
 * and usage limits.
 * 
 * @param userId The user ID to check
 * @returns Object with allowed status and optional reason if not allowed
 */
export async function checkSubscriptionAccess(userId: number): Promise<SubscriptionAccessResult> {
  try {
    // Get the user
    const user = await storage.getUser(userId);
    
    if (!user) {
      return {
        allowed: false,
        reason: "User not found"
      };
    }
    
    // Check if user has a premium plan
    if (!user.subscriptionPlan || user.subscriptionPlan === "FREE") {
      return {
        allowed: false,
        reason: "Free plan cannot use auto-apply"
      };
    }
    
    // Check if subscription is expired
    if (user.subscriptionEndDate && new Date(user.subscriptionEndDate) < new Date()) {
      return {
        allowed: false,
        reason: "Subscription expired"
      };
    }
    
    // Get the plan details
    const planDetails = subscriptionPlans.find(plan => plan.id === user.subscriptionPlan);
    if (!planDetails) {
      return {
        allowed: false,
        reason: "Invalid subscription plan"
      };
    }
    
    // Check daily application limit
    // First, count how many applications were made today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Get jobs applied today
    const appliedToday = await storage.getJobsAppliedToday(userId, today);
    
    if (appliedToday >= planDetails.dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit reached (${appliedToday}/${planDetails.dailyLimit})`
      };
    }
    
    // All checks passed
    return {
      allowed: true
    };
  } catch (error) {
    console.error("Error checking subscription access:", error);
    return {
      allowed: false,
      reason: "Error checking subscription status"
    };
  }
}

/**
 * Gets the remaining applications a user can make today
 * 
 * @param userId The user ID to check
 * @returns Number of remaining applications or 0 if limit reached/error
 */
export async function getRemainingApplications(userId: number): Promise<number> {
  try {
    // Get the user
    const user = await storage.getUser(userId);
    
    if (!user) {
      return 0;
    }
    
    // If free plan, return 0
    if (!user.subscriptionPlan || user.subscriptionPlan === "FREE") {
      return 0;
    }
    
    // Get the plan details
    const planDetails = subscriptionPlans.find(plan => plan.id === user.subscriptionPlan);
    if (!planDetails) {
      return 0;
    }
    
    // Get jobs applied today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appliedToday = await storage.getJobsAppliedToday(userId, today);
    
    // Calculate remaining
    const remaining = Math.max(0, planDetails.dailyLimit - appliedToday);
    return remaining;
  } catch (error) {
    console.error("Error getting remaining applications:", error);
    return 0;
  }
}