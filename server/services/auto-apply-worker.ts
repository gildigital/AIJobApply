/**
 * Auto Apply Worker - Background Job Queue Worker
 *
 * This service manages the background processing of job applications
 * based on user subscription plan and daily application limits.
 */

import { storage } from "../storage.js";
import {
  startAutoApply,
  submitApplication,
  addJobToTracker,
  createAutoApplyLog,
  JobListing,
  scoreJobFit,
} from "./auto-apply-service.js";
import { cleanupJobLinks } from '../utils/cleanup-job-links.js';
import { JobQueue, JobTracker, User, jobQueue } from "@shared/schema.js";
import { db } from "../db.js";
import { eq } from "drizzle-orm";

// Configuration for worker delays
const WORKER_INTERVAL_MS = 10000; // Run worker every 10 seconds
const DEFAULT_BATCH_SIZE = 5; // Process 5 jobs at a time
const DELAY_BETWEEN_USERS_MS = 5000; // 5 seconds between users

// Error tracking and recovery
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RECOVERY_DELAY_MS = 30000; // 30 seconds before retrying after multiple errors
const HEARTBEAT_LOG_INTERVAL = 60000; // Log heartbeat every 60 seconds

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
let heartbeatInterval: NodeJS.Timeout | null = null;
let consecutiveErrors = 0;
let lastSuccessfulRun = new Date();
let totalJobsProcessed = 0;
let workerStartTime = new Date();

// Track the last calendar day (UTC) when we ran cleanup
let lastCleanupDate = getUTCDateString(new Date());

// Track the last time we searched for jobs for each user (to avoid constant searching)
const lastJobSearchByUser: Record<number, number> = {};
const JOB_SEARCH_COOLDOWN_MS = 60000; // 1 minute between job searches per user (reduced from 5 minutes)

function getUTCDateString(d: Date): string {
  return d.toISOString().slice(0, 10);  // e.g. "2025-06-13"
}

/**
 * Start the auto-apply worker with improved resilience
 * This function starts a background worker that processes job applications
 */
export function startAutoApplyWorker(): void {
  if (isWorkerRunning) {
    console.log("[Auto-Apply Worker] Worker already running");
    return;
  }

  console.log("[Auto-Apply Worker] Starting resilient worker");
  isWorkerRunning = true;
  consecutiveErrors = 0;
  workerStartTime = new Date();
  totalJobsProcessed = 0;

  // Run the worker immediately once
  processQueuedJobsWithErrorHandling();

  // Set up interval for continuous processing with error handling
  workerInterval = setInterval(processQueuedJobsWithErrorHandling, WORKER_INTERVAL_MS);

  // Set up heartbeat logging to monitor worker health
  heartbeatInterval = setInterval(logWorkerHeartbeat, HEARTBEAT_LOG_INTERVAL);

  // Set up process-level error handlers to prevent crashes
  setupGlobalErrorHandlers();

  console.log("[Auto-Apply Worker] Worker started successfully with enhanced error recovery");
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

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  console.log("[Auto-Apply Worker] Worker stopped successfully");
}

/**
 * Wrapper for processQueuedJobs with enhanced error handling
 */
async function processQueuedJobsWithErrorHandling(): Promise<void> {
  try {
    await processQueuedJobs();

    // Reset error counter on successful run
    if (consecutiveErrors > 0) {
      console.log(`[Auto-Apply Worker] Recovered from ${consecutiveErrors} consecutive errors`);
      consecutiveErrors = 0;
    }
    lastSuccessfulRun = new Date();

  } catch (error) {
    consecutiveErrors++;
    console.error(`[Auto-Apply Worker] Error in worker cycle (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

    // If too many consecutive errors, temporarily stop the worker and restart with delay
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`[Auto-Apply Worker] Too many consecutive errors (${consecutiveErrors}). Restarting worker in ${ERROR_RECOVERY_DELAY_MS}ms...`);

      // Stop current worker
      if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
      }

      // Restart after delay
      setTimeout(() => {
        if (isWorkerRunning) { // Only restart if we weren't manually stopped
          console.log("[Auto-Apply Worker] Restarting worker after error recovery delay");
          consecutiveErrors = 0;
          workerInterval = setInterval(processQueuedJobsWithErrorHandling, WORKER_INTERVAL_MS);
        }
      }, ERROR_RECOVERY_DELAY_MS);
    }
  }
}

/**
 * Set up global error handlers to prevent the worker from crashing
 */
function setupGlobalErrorHandlers(): void {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Auto-Apply Worker] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Auto-Apply Worker] Uncaught Exception:', error);
    // Don't exit the process, just log the error
    // In production, you might want to restart the worker here
  });
}

/**
 * Log worker heartbeat and status information
 */
function logWorkerHeartbeat(): void {
  const uptime = Date.now() - workerStartTime.getTime();
  const uptimeMinutes = Math.floor(uptime / 60000);
  const timeSinceLastSuccess = Date.now() - lastSuccessfulRun.getTime();
  const minutesSinceSuccess = Math.floor(timeSinceLastSuccess / 60000);

  console.log(`[Auto-Apply Worker] Heartbeat - Uptime: ${uptimeMinutes}m, Jobs processed: ${totalJobsProcessed}, Last success: ${minutesSinceSuccess}m ago, Errors: ${consecutiveErrors}`);
}

/**
 * Process the next batch of queued jobs
 */
async function processQueuedJobs(): Promise<void> {
  // Check if we need to reactivate any standby jobs (it's a new day)
  await checkAndReactivateStandbyJobs();

  // Check if we need to find and queue new jobs for enabled users
  await checkAndQueueJobsForEnabledUsers();

  // Get next batch of pending jobs
  const pendingJobs = await storage.getNextJobsFromQueue(DEFAULT_BATCH_SIZE);

  if (pendingJobs.length === 0) {
    // No jobs to process - this is normal, not an error
    return;
  }

  console.log(`[Auto-Apply Worker] Processing ${pendingJobs.length} jobs`);

  // Process each job
  for (const queuedJob of pendingJobs) {
    try {
      await processJob(queuedJob);
      totalJobsProcessed++;
    } catch (error) {
      console.error(`[Auto-Apply Worker] Error processing individual job ${queuedJob.id}:`, error);
      // Continue processing other jobs even if one fails
    }
  }
}

/**
 * Check for users with auto-apply enabled and queue jobs for them
 */
async function checkAndQueueJobsForEnabledUsers(): Promise<void> {
  try {
    const users = await storage.getAllUsers();
    if (!users?.length) return;

    const enabledUsers = users.filter(user => user.isAutoApplyEnabled);
    if (enabledUsers.length === 0) return;

    console.log(`[Auto-Apply Worker] Found ${enabledUsers.length} users to process sequentially.`);

    // Use a "for...of" loop which works well with "await"
    for (const user of enabledUsers) {
      try {
        // Check if user has remaining applications before trying to start
        const { getRemainingApplications } = await import("../utils/subscription-utils.js");
        const remainingApplications = await getRemainingApplications(user.id);
        
        if (remainingApplications <= 0) {
          // Skip this user silently - they've reached their daily limit
          continue;
        }

        console.log(`[Auto-Apply Worker] Starting engine for user ${user.id}...`);
        
        // Use 'await' to ensure we process one user completely before starting the next.
        await startAutoApply(user.id);

        console.log(`[Auto-Apply Worker] Engine finished for user ${user.id}. Waiting for ${DELAY_BETWEEN_USERS_MS / 1000}s...`);
        
        // Add the deliberate pause after each user is processed.
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_USERS_MS));

      } catch (err) {
        console.error(`[Auto-Apply Worker] Error occurred during auto-apply process for user ${user.id}:`, (err as Error).message);
      }
    }
  } catch (error) {
    console.error('[Auto-Apply Worker] Error in checkAndQueueJobsForEnabledUsers:', error);
  }
}

/**
 * Check if any jobs in standby mode need to be reactivated (daily reset)
 * — and once per UTC‐day run cleanupJobLinks() to demote duplicate postings.
 */
async function checkAndReactivateStandbyJobs(): Promise<void> {
  try {
    // 1) Detect UTC‐day rollover and run dedupe once
    const currentDateString = getUTCDateString(new Date());
    if (currentDateString !== lastCleanupDate) {
      console.log(
        `[Auto-Apply Worker] UTC date rolled over ${lastCleanupDate} → ${currentDateString}, running cleanupJobLinks()…`
      );
      await cleanupJobLinks();
      lastCleanupDate = currentDateString;
    }

    // 2) Gather all users and their standby jobs
    const users = await storage.getAllUsers();
    if (!users?.length) return;

    let totalStandbyJobs = 0;
    const jobsByUser: Record<number, JobQueue[]> = {};
    for (const user of users) {
      const queued = await storage.getQueuedJobsForUser(user.id);
      const standby = queued.filter(j => j.status === 'standby');
      if (standby.length) {
        jobsByUser[user.id] = standby;
        totalStandbyJobs += standby.length;
      }
    }
    if (totalStandbyJobs === 0) return;

    console.log(
      `[Auto-Apply Worker] Checking ${totalStandbyJobs} standby jobs for reactivation`
    );

    // 3) For each user, see if they have slots left and reactivate
    for (const [userIdStr, standbyJobs] of Object.entries(jobsByUser)) {
      const userId = Number(userIdStr);

      // zero‐out today's date for counting
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const appliedToday = await storage.getJobsAppliedToday(userId, today);

      const user = await storage.getUser(userId);
      if (!user) continue;
      const plan = user.subscriptionPlan || 'FREE';
      const limit = DAILY_LIMITS[plan as keyof typeof DAILY_LIMITS] ?? DAILY_LIMITS.FREE;

      if (appliedToday < limit) {
        const slots = limit - appliedToday;
        const toReactivate = standbyJobs.slice(0, slots);

        console.log(
          `[Auto-Apply Worker] Reactivating ${toReactivate.length} jobs for user ${userId} (${slots} slots left)`
        );

        for (const job of toReactivate) {
          await storage.updateQueuedJob(job.id, {
            status: 'pending',
            error: null,
            updatedAt: new Date(),
          });
          await createAutoApplyLog({
            userId,
            jobId: job.jobId,
            status: 'Reactivated',
            message: 'Job reactivated after daily application limit reset',
          });
        }
      }
    }
  } catch (err) {
    console.error('[Auto-Apply Worker] Error in checkAndReactivateStandbyJobs:', err);
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
    today.setUTCHours(0, 0, 0, 0);
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
 * Ensure the worker is running and restart if necessary
 * This function can be called periodically or when suspecting the worker has stopped
 */
export function ensureWorkerIsRunning(): boolean {
  const currentTime = Date.now();
  const timeSinceLastSuccess = currentTime - lastSuccessfulRun.getTime();
  const maxIdleTime = WORKER_INTERVAL_MS * 10; // If no success for 10 cycles, restart

  // Check if worker appears to be stuck or stopped
  if (isWorkerRunning && timeSinceLastSuccess > maxIdleTime && consecutiveErrors < MAX_CONSECUTIVE_ERRORS) {
    console.warn(`[Auto-Apply Worker] Worker appears stuck (${Math.floor(timeSinceLastSuccess / 60000)}m since last success). Restarting...`);

    // Force restart
    stopAutoApplyWorker();
    setTimeout(() => {
      startAutoApplyWorker();
    }, 1000);

    return false; // Worker was restarted
  }

  // If worker is not running, start it
  if (!isWorkerRunning) {
    console.log("[Auto-Apply Worker] Worker not running, starting...");
    startAutoApplyWorker();
    return false; // Worker was started
  }

  return true; // Worker is healthy and running
}

/**
 * Get comprehensive worker status information
 */
export function getWorkerStatus(): any {
  const currentTime = Date.now();
  const uptime = currentTime - workerStartTime.getTime();
  const timeSinceLastSuccess = currentTime - lastSuccessfulRun.getTime();

  return {
    isRunning: isWorkerRunning,
    consecutiveErrors,
    totalJobsProcessed,
    workerStartTime: workerStartTime.toISOString(),
    lastSuccessfulRun: lastSuccessfulRun.toISOString(),
    uptimeMinutes: Math.floor(uptime / 60000),
    minutesSinceLastSuccess: Math.floor(timeSinceLastSuccess / 60000),
    isHealthy: isWorkerRunning && consecutiveErrors < MAX_CONSECUTIVE_ERRORS,
    maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS,
    workerInterval: WORKER_INTERVAL_MS,
    errorRecoveryDelay: ERROR_RECOVERY_DELAY_MS
  };
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
    today.setUTCHours(0, 0, 0, 0);
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
    resetTime.setUTCHours(24, 0, 0, 0); // Set to midnight tonight

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
      latestMessage = `${standby} job${standby !== 1 ? "s" : ""
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
      // Worker health information
      workerHealth: {
        consecutiveErrors,
        lastSuccessfulRun: lastSuccessfulRun.toISOString(),
        totalJobsProcessed,
        uptimeMinutes: Math.floor((Date.now() - workerStartTime.getTime()) / 60000),
        isHealthy: consecutiveErrors < MAX_CONSECUTIVE_ERRORS
      }
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