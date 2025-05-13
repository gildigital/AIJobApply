import { Express, Request, Response } from "express";
// @ts-ignore - JS migration file
import { runMigration as runJobPreferencesMigration } from '../migrations/add-job-preferences-columns.js';
// @ts-ignore - JS migration file
import { runMigration as runJobQueueStandbyMigration } from '../migrations/add-standby-status-to-job-queue.js';

/**
 * Register routes for running database migrations
 */
export function registerMigrationRoutes(app: Express) {
  /**
   * Endpoint to run the job preferences columns migration
   * This is a temporary endpoint for development and should be removed in production
   */
  app.post("/server-only/run-job-preferences-migration", async (req: Request, res: Response) => {
    try {
      await runJobPreferencesMigration();
      res.json({ success: true, message: "Job preferences migration completed successfully" });
    } catch (error) {
      console.error("Migration failed:", error);
      res.status(500).json({ 
        success: false, 
        message: "Migration failed", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  /**
   * Endpoint to run the job queue standby status migration
   * This is a temporary endpoint for development and should be removed in production
   */
  app.post("/server-only/run-job-queue-standby-migration", async (req: Request, res: Response) => {
    try {
      await runJobQueueStandbyMigration();
      res.json({ success: true, message: "Job queue standby migration completed successfully" });
    } catch (error) {
      console.error("Migration failed:", error);
      res.status(500).json({ 
        success: false, 
        message: "Migration failed", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
  
  // Legacy endpoint for backwards compatibility
  app.post("/server-only/run-migration", async (req: Request, res: Response) => {
    try {
      await runJobPreferencesMigration();
      res.json({ success: true, message: "Migration completed successfully" });
    } catch (error) {
      console.error("Migration failed:", error);
      res.status(500).json({ 
        success: false, 
        message: "Migration failed", 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  });
}