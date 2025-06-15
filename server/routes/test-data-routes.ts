import { Express } from "express";
import { db } from "../db.js";
import { storage } from "../storage.js";
import { jobTracker, autoApplyLogs } from "@shared/schema.js";
import { eq } from "drizzle-orm";

/**
 * Register routes for clearing test data (development only)
 */
export function registerTestDataRoutes(app: Express) {
  // Only enable these routes in development environment for safety
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  /**
   * Clear test data for the authenticated user 
   * This removes all job tracker entries and auto-apply logs
   */
  app.post("/api/test/clear-data", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const userId = req.user.id;
      
      // Clear auto-apply logs for this user FIRST
      // because they reference job tracker entries via foreign key
      const deletedLogs = await db.delete(autoApplyLogs)
        .where(eq(autoApplyLogs.userId, userId))
        .returning();
      
      // Then clear job tracker entries for this user
      const deletedJobs = await db.delete(jobTracker)
        .where(eq(jobTracker.userId, userId))
        .returning();
      
      // Turn off auto-apply flag if it's on
      if (req.user.isAutoApplyEnabled) {
        await storage.updateUser(userId, { isAutoApplyEnabled: false });
      }
      
      // console.log(`Test data cleared for user ${userId}: ${deletedJobs.length} jobs, ${deletedLogs.length} logs`);
      
      res.status(200).json({
        message: 'Test data cleared successfully',
        deletedJobs: deletedJobs.length,
        deletedLogs: deletedLogs.length
      });
    } catch (error) {
      console.error('Error clearing test data:', error);
      res.status(500).json({ message: 'Failed to clear test data' });
    }
  });
}