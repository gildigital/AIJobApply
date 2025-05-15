/**
 * Auto Apply Worker - Background Job Queue Worker
 *
 * This service manages the background processing of job applications
 * based on user subscription plan and daily application limits.
 */

import { storage } from "../storage.js";
import {
  submitApplication,
  addJobToTracker,
  createAutoApplyLog,
  JobListing,
  scoreJobFit,
} from "./auto-apply-service.js";
import { JobQueue, JobTracker, User, jobQueue } from "@shared/schema.js";
import { db } from "../db.js";
import { eq } from "drizzle-orm";

// Configuration for worker delays
const WORKER_INTERVAL_MS = 10000; // Run worker every 10 seconds
const DEFAULT_BATCH_SIZE = 5; // Process 5 jobs at a time

// Plan-based throttling settings
const APPLY_DELAY_MS = {
  GOLD: 1000, // 1 second between Gold tier applications
  one_month_gold: 1000,
  three_months_gold: 1000,
  one_month_silver: 3000, // 3 seconds between Silver tier applications
  two_weeks: 3000,
  FREE: 5000, // 5 seconds for free tier
};

// Application limits per plan
const DAILY_LIMITS = {
  GOLD: 100,
  one_month_gold: 100,
  three_months_gold: 100,
  one_month_silver: 40,
  two_weeks: 20,
  FREE: 5,
};

// Worker state
let isWorkerRunning = false;
let workerInterval: NodeJS.Timeout | null = null;

/**
 * Start the auto-apply worker
 * This function starts a background worker that processes job applications
 */
export function startAutoApplyWorker(): void {
  if (isWorkerRunning) {
    console.log("[Auto-Apply Worker] Worker already running");
    return;
  }

  console.log("[Auto-Apply Worker] Starting worker");
  isWorkerRunning = true;

  // Run the worker immediately once
  processQueuedJobs();

  // Then set up interval for continuous processing
  workerInterval = setInterval(processQueuedJobs, WORKER_INTERVAL_MS);
}

/**
 * Stop the auto-apply worker
 */
export function stopAutoApplyWorker(): void {
  if (!isWorkerRunning) {
    console.log("[Auto-Apply Worker] Worker not running");
    return;
  }

  console.log("[Auto-Apply Worker] Stopping worker");
  isWorkerRunning = false;

  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

/**
 * Process the next batch of queued jobs
 */
async function processQueuedJobs(): Promise<void> {
  try {
    // Check if we need to reactivate any standby jobs (it's a new day)
    await checkAndReactivateStandbyJobs();

    // Get next batch of pending jobs
    const pendingJobs = await storage.getNextJobsFromQueue(DEFAULT_BATCH_SIZE);

    if (pendingJobs.length === 0) {
      // No jobs to process
      return;
    }

    console.log(`[Auto-Apply Worker] Processing ${pendingJobs.length} jobs`);

    // Process each job
    for (const queuedJob of pendingJobs) {
      await processJob(queuedJob);
    }
  } catch (error) {
    console.error("[Auto-Apply Worker] Error processing queued jobs:", error);
  }
}

/**
 * Check if any jobs in standby mode need to be reactivated (daily reset)
 */
async function checkAndReactivateStandbyJobs(): Promise<void> {
  try {
    // Using raw SQL through db.execute to get around type issues temporarily
    // We'll be using direct database access for this specific operation
    // since our storage interface might not have methods for the new status yet

    // For now, we'll use a simpler approach that uses the existing storage interface
    // Get all queued jobs for all users (not optimal but will work until we add a new method)
    // Then filter in memory to find standby jobs

    // First, get all users
    const users = await storage.getAllUsers();

    if (!users || users.length === 0) {
      return; // No users to check
    }

    let totalStandbyJobs = 0;
    const jobsByUser: Record<number, JobQueue[]> = {};

    // For each user, get their queued jobs and filter for standby
    for (const user of users) {
      const userQueuedJobs = await storage.getQueuedJobsForUser(user.id);
      const standbyJobs = userQueuedJobs.filter(
        (job) => job.status === "standby"
      );

      if (standbyJobs.length > 0) {
        jobsByUser[user.id] = standbyJobs;
        totalStandbyJobs += standbyJobs.length;
      }
    }

    if (totalStandbyJobs === 0) {
      return; // No standby jobs to check
    }

    console.log(
      `[Auto-Apply Worker] Checking ${totalStandbyJobs} standby jobs for reactivation`
    );

    // Check each user's daily application limit
    for (const [userIdStr, jobs] of Object.entries(jobsByUser)) {
      const userId = parseInt(userIdStr, 10);

      // Check if user has available application slots today
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const appliedToday = await storage.getJobsAppliedToday(userId, today);

      // Get user's plan details
      const user = await storage.getUser(userId);
      if (!user) continue;

      const userPlan = user.subscriptionPlan || "FREE";
      const userDailyLimit =
        DAILY_LIMITS[userPlan as keyof typeof DAILY_LIMITS] ||
        DAILY_LIMITS.FREE;

      // If user has applications available, reactivate their standby jobs
      if (appliedToday < userDailyLimit) {
        const availableSlots = userDailyLimit - appliedToday;
        const jobsToReactivate = jobs.slice(0, availableSlots);

        console.log(
          `[Auto-Apply Worker] Reactivating ${jobsToReactivate.length} standby jobs for user ${userId} (${availableSlots} slots available)`
        );

        // Reactivate jobs
        for (const job of jobsToReactivate) {
          await storage.updateQueuedJob(job.id, {
            status: "pending",
            error: null,
            updatedAt: new Date(),
          });

          await createAutoApplyLog({
            userId,
            jobId: job.jobId,
            status: "Reactivated",
            message: "Job reactivated after daily application limit reset",
          });
        }
      }
    }
  } catch (error) {
    console.error(
      "[Auto-Apply Worker] Error reactivating standby jobs:",
      error
    );
  }
}

/**
 * Process a single job from the queue
 */
async function processJob(queuedJob: JobQueue): Promise<void> {
  try {
    // Mark job as processing
    await storage.updateQueuedJob(queuedJob.id, {
      status: "processing",
      attemptCount: queuedJob.attemptCount + 1,
    });

    // Get user and job details
    const user = await storage.getUser(queuedJob.userId);
    const job = await storage.getJob(queuedJob.jobId);

    if (!user || !job) {
      await storage.updateQueuedJob(queuedJob.id, {
        status: "failed",
        error: "User or job not found",
      });
      return;
    }

    if (!user.isAutoApplyEnabled) {
      await storage.updateQueuedJob(queuedJob.id, {
        status: "skipped",
        error: "Auto-apply is disabled for this user.",
        processedAt: new Date(),
      });
      await createAutoApplyLog({
        userId: user.id,
        jobId: job.id,
        status: "Skipped",
        message: "Job skipped because auto-apply is disabled for this user.",
      });
      return;
    }

    // Check daily limits
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appliedToday = await storage.getJobsAppliedToday(user.id, today);
    const userPlan = user.subscriptionPlan || "FREE";
    const userDailyLimit =
      DAILY_LIMITS[userPlan as keyof typeof DAILY_LIMITS] || DAILY_LIMITS.FREE;

    if (appliedToday >= userDailyLimit) {
      // Instead of marking as failed, put in standby mode
      await storage.updateQueuedJob(queuedJob.id, {
        status: "standby", // New status for jobs waiting for limit reset
        error: "Daily application limit reached, will resume after midnight",
      });

      await createAutoApplyLog({
        userId: user.id,
        jobId: job.id,
        status: "Standby",
        message: `Job queued in standby mode. Daily limit of ${userDailyLimit} applications reached. Will resume after midnight reset.`,
      });

      return;
    }

    // Convert job tracker record to JobListing format
    const jobListing: JobListing = {
      jobTitle: job.jobTitle,
      company: job.company,
      description: job.notes || "",
      applyUrl: job.link || "",
      location: "", // Job tracker doesn't store location directly
      source: job.source ? job.source : "",
      externalJobId: job.externalJobId ? job.externalJobId : "",
    };

    // Add match score if available (explicit handling with type casting for better compatibility)
    if (job.matchScore !== null && job.matchScore !== undefined) {
      jobListing.matchScore = job.matchScore;
    }

    // Submit the application to the Playwright worker
    const result = await submitApplication(user, jobListing);

    // Update job status based on result
    if (result === "success") {
      await storage.updateJob(job.id, {
        status: "applied",
        applicationStatus: "applied",
        appliedAt: new Date(),
      });

      await storage.updateQueuedJob(queuedJob.id, {
        status: "completed",
        processedAt: new Date(),
      });

      await createAutoApplyLog({
        userId: user.id,
        jobId: job.id,
        status: "Applied",
        message: "Successfully applied to job via Playwright worker",
      });
    } else {
      const errorMessage =
        result === "skipped"
          ? "Application skipped by Playwright worker - form not compatible or already applied"
          : "Error applying to job via Playwright worker";

      await storage.updateJob(job.id, {
        applicationStatus: result === "skipped" ? "skipped" : "failed",
      });

      await storage.updateQueuedJob(queuedJob.id, {
        status: result === "skipped" ? "skipped" : "failed", // Use proper status in queue
        error: errorMessage,
        processedAt: new Date(),
      });

      await createAutoApplyLog({
        userId: user.id,
        jobId: job.id,
        status: result === "skipped" ? "Skipped" : "Failed",
        message: errorMessage,
      });
    }

    // Apply throttling delay between jobs
    const delayMs =
      APPLY_DELAY_MS[userPlan as keyof typeof APPLY_DELAY_MS] ||
      APPLY_DELAY_MS.FREE;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  } catch (error) {
    console.error(
      `[Auto-Apply Worker] Error processing job ${queuedJob.id}:`,
      error
    );

    // Update job status to failed
    await storage.updateQueuedJob(queuedJob.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      processedAt: new Date(),
    });
  }
}

/**
 * Enqueue jobs for auto-apply based on user plan priority
 *
 * @param userId User ID to enqueue jobs for
 * @param jobIds Array of job tracker IDs to enqueue
 * @returns Array of enqueued job objects
 */
export async function enqueueJobsForUser(
  userId: number,
  jobIds: number[]
): Promise<JobQueue[]> {
  if (!jobIds.length) return [];

  try {
    // Get user to determine priority
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Set queue priority based on subscription plan
    const priority = getPriorityForPlan(user.subscriptionPlan || "FREE");

    // Create queue items for each job
    const queueItems = jobIds.map((jobId) => ({
      userId,
      jobId,
      priority,
    }));

    const now = new Date();

    // Add jobs to queue
    const queuedJobs = await storage.enqueueJobs(
      queueItems.map((item) => ({
        ...item,
        status: "queued",
        attemptCount: 0,
        createdAt: now,
      }))
    );
    // Log the enqueued jobs
    await Promise.all(
      jobIds.map((jobId) =>
        createAutoApplyLog({
          userId,
          jobId,
          status: "Queued",
          message: "Job added to auto-apply queue",
        })
      )
    );

    return queuedJobs;
  } catch (error) {
    console.error(
      `[Auto-Apply Worker] Error enqueuing jobs for user ${userId}:`,
      error
    );
    throw error;
  }
}

/**
 * Get the queue priority value based on the subscription plan
 * Higher values = higher priority in queue
 */
function getPriorityForPlan(plan: string): number {
  switch (plan) {
    case "GOLD":
    case "one_month_gold":
    case "three_months_gold":
      return 100; // Highest priority
    case "one_month_silver":
    case "two_weeks":
      return 50; // Medium priority
    case "FREE":
    default:
      return 10; // Lowest priority
  }
}

/**
 * Get the auto-apply status for a user
 *
 * @param userId User ID to get status for
 * @returns Object with status information
 */
export async function getAutoApplyStatus(userId: number): Promise<any> {
  try {
    // Get all queued jobs for the user
    const queuedJobs = await storage.getQueuedJobsForUser(userId);

    // Count jobs by status
    const pending = queuedJobs.filter((job) => job.status === "pending").length;
    const processing = queuedJobs.filter(
      (job) => job.status === "processing"
    ).length;
    const standby = queuedJobs.filter((job) => job.status === "standby").length;

    // Get completed and failed jobs from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const appliedToday = await storage.getJobsAppliedToday(userId, today);

    // Get user's plan limit
    const user = await storage.getUser(userId);
    const userPlan = user?.subscriptionPlan || "FREE";
    const dailyLimit =
      DAILY_LIMITS[userPlan as keyof typeof DAILY_LIMITS] || DAILY_LIMITS.FREE;

    // Calculate remaining applications (can be negative if over limit)
    const remainingApplications = dailyLimit - appliedToday;

    // Calculate when the daily counter resets (midnight tonight)
    const resetTime = new Date();
    resetTime.setHours(24, 0, 0, 0); // Set to midnight tonight

    // Determine if we're in standby mode (daily limit reached AND have standby jobs)
    const isInStandbyMode = remainingApplications <= 0 && standby > 0;

    // Determine current status
    let currentStatus = "Completed";
    if (pending > 0 || processing > 0) {
      currentStatus = "In Progress";
    } else if (standby > 0 && remainingApplications <= 0) {
      currentStatus = "Standby";
    }

    // Create message for standby mode
    let latestMessage = "";
    if (isInStandbyMode) {
      const resetTimeFormatted = new Date(resetTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      latestMessage = `${standby} job${
        standby !== 1 ? "s" : ""
      } in standby mode. Daily limit reached. Applications will resume at ${resetTimeFormatted}.`;
    }

    return {
      currentStatus,
      isWorkerRunning, // Worker state variable from the module
      isAutoApplyEnabled: user?.isAutoApplyEnabled ?? false,
      isInStandbyMode,
      queuedJobs: pending + processing,
      standbyJobs: standby,
      completedJobs: appliedToday,
      failedJobs: queuedJobs.filter((job) => job.status === "failed").length,
      latestMessage,
      appliedToday,
      dailyLimit,
      remainingToday: remainingApplications,
      nextReset: resetTime.toISOString(),
    };
  } catch (error) {
    console.error(
      `[Auto-Apply Worker] Error getting status for user ${userId}:`,
      error
    );
    throw error;
  }
}

// Start the worker when the server starts up
startAutoApplyWorker();
