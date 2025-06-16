import type { Express, Request, Response } from "express";
import { storage } from "../storage.js";
import { queueJobApplication, getApplicationStatus } from "../services/job-application-queue.js";
// @ts-expect-error: No type definitions for migration file
import { runMigration } from "../migrations/add-application-payloads-table.js";

export function registerJobQueueRoutes(app: Express) {
  
  // Route to run the application payloads table migration
  app.post("/api/admin/migrate/application-payloads", async (req: Request, res: Response) => {
    try {
      const result = await runMigration();
      
      if (result.success) {
        return res.json({
          success: true,
          message: result.message
        });
      } else {
        return res.status(500).json({
          success: false,
          error: result.error
        });
      }
    } catch (error) {
      console.error("Error running application payloads migration:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Route to test the async job queue system
  app.post("/api/test/queue-application", async (req: Request, res: Response) => {
    try {
      const { jobUrl, userId = 1 } = req.body;

      if (!jobUrl) {
        return res.status(400).json({
          success: false,
          error: "jobUrl is required"
        });
      }

      // Get user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found"
        });
      }

      // Get user profile
      const profile = await storage.getUserProfile(userId);

      // Create a test job listing
      const testJob = {
        jobTitle: "Test Job",
        company: "Test Company", 
        description: "This is a test job for the async queue system",
        applyUrl: jobUrl,
        location: "Remote",
        source: "workable",
        externalJobId: `test_${Date.now()}`,
        matchScore: 75
      };

      // Test resume data
      const resume = await storage.getResume(userId);

      // Queue the application
      const queueResult = await queueJobApplication({
        user,
        resume,
        profile,
        job: testJob,
        matchScore: 75,
        formData: {} // This would be populated by form introspection
      });

      return res.json({
        success: queueResult.success,
        message: queueResult.message,
        queuedJobId: queueResult.queuedJobId
      });

    } catch (error) {
      console.error("Error testing queue application:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Route to check application status
  app.get("/api/test/queue-status/:queuedJobId", async (req: Request, res: Response) => {
    try {
      const queuedJobId = parseInt(req.params.queuedJobId);
      
      if (isNaN(queuedJobId)) {
        return res.status(400).json({
          success: false,
          error: "Invalid queuedJobId"
        });
      }

      const status = await getApplicationStatus(queuedJobId);

      return res.json({
        success: true,
        status
      });

    } catch (error) {
      console.error("Error getting queue status:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Route to get current queue status
  app.get("/api/admin/queue-status", async (req: Request, res: Response) => {
    try {
      // Get all pending jobs
      const pendingJobs = await storage.getNextJobsFromQueue(50);
      
      // Count jobs by status for all users
      const allUsers = await storage.getAllUsers();
      let totalPending = 0;
      let totalProcessing = 0;
      let totalCompleted = 0;
      let totalFailed = 0;

      for (const user of allUsers) {
        const userJobs = await storage.getQueuedJobsForUser(user.id);
        totalPending += userJobs.filter(job => job.status === 'pending').length;
        totalProcessing += userJobs.filter(job => job.status === 'processing').length;
        totalCompleted += userJobs.filter(job => job.status === 'completed').length;
        totalFailed += userJobs.filter(job => job.status === 'failed').length;
      }

      return res.json({
        success: true,
        queueStatus: {
          pending: totalPending,
          processing: totalProcessing,
          completed: totalCompleted,
          failed: totalFailed,
          nextJobs: pendingJobs.slice(0, 5).map(job => ({
            id: job.id,
            userId: job.userId,
            priority: job.priority,
            createdAt: job.createdAt,
            attemptCount: job.attemptCount
          }))
        }
      });

    } catch (error) {
      console.error("Error getting queue status:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
} 