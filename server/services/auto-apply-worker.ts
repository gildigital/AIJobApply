/**
 * Auto Apply Worker - Intelligent Work Management System
 *
 * This service manages the background processing of job applications
 * with proper work lifecycle management to prevent redundant API calls
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
import { processQueuedApplication } from "./job-application-queue.js";

// 🎯 INTELLIGENT WORK MANAGEMENT CONFIGURATION
const WORK_COORDINATOR_INTERVAL_MS = 6 * 60 * 1000; // Check every 6 minutes (was 10 minutes)
const JOB_PROCESSOR_INTERVAL_MS = 30 * 1000; // Process queued jobs every 30 seconds
const DEFAULT_BATCH_SIZE = 1; // Process 1 job at a time (was 5)
const DELAY_BETWEEN_APPLICATIONS_MS = 45000; // 45 seconds between applications (was 5 seconds)

// 🔄 WORK STATE MANAGEMENT
interface UserWorkState {
  userId: number;
  isSearchingForJobs: boolean;
  isProcessingApplications: boolean;
  lastJobSearchTime: number;
  lastApplicationTime: number;
  applicationCooldownEnd: number; // Keep this one for application spacing
}

// Track work state for each user
const userWorkStates = new Map<number, UserWorkState>();

// Job search cooldown: Only search for new jobs once every 30 minutes per user
const JOB_SEARCH_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes (was 1 minute!)

// Error tracking and recovery
const MAX_CONSECUTIVE_ERRORS = 5;
const ERROR_RECOVERY_DELAY_MS = 30000; // 30 seconds before retrying after multiple errors
const HEARTBEAT_LOG_INTERVAL = 5 * 60 * 1000; // Log heartbeat every 5 minutes (was 1 minute)

// Plan-based throttling settings
const APPLY_DELAY_MS = {
  GOLD: 30000,     // 30 seconds between Gold tier applications (was 1 second!)
  one_month_gold: 30000,
  three_months_gold: 30000,
  one_month_silver: 60000,  // 1 minute between Silver tier applications (was 3 seconds!)
  two_weeks: 60000,
  FREE: 120000,    // 2 minutes for free tier (was 5 seconds!)
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
let isCoordinatorRunning = false;
let isProcessorRunning = false;
let coordinatorInterval: NodeJS.Timeout | null = null;
let processorInterval: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let consecutiveErrors = 0;
let lastSuccessfulRun = new Date();
let totalJobsProcessed = 0;
let workerStartTime = new Date();

// Track the last calendar day (UTC) when we ran cleanup
let lastCleanupDate = getUTCDateString(new Date());

function getUTCDateString(d: Date): string {
  return d.toISOString().slice(0, 10);  // e.g. "2025-06-13"
}

/**
 * 🎯 Get or create work state for a user
 */
function getUserWorkState(userId: number): UserWorkState {
  if (!userWorkStates.has(userId)) {
    userWorkStates.set(userId, {
      userId,
      isSearchingForJobs: false,
      isProcessingApplications: false,
      lastJobSearchTime: 0,
      lastApplicationTime: 0,
      applicationCooldownEnd: 0
    });
  }
  return userWorkStates.get(userId)!;
}

/**
 * 🔄 Check if user needs new job search
 */
function shouldSearchForJobs(userId: number): boolean {
  const state = getUserWorkState(userId);
  
  // Don't search if already searching
  if (state.isSearchingForJobs) {
    return false;
  }
  
  return true;
}

/**
 * 🔄 Check if user can process applications
 */
function canProcessApplications(userId: number): boolean {
  const state = getUserWorkState(userId);
  const now = Date.now();
  
  // Don't process if already processing
  if (state.isProcessingApplications) {
    return false;
  }
  
  // Don't process if still in cooldown
  if (now < state.applicationCooldownEnd) {
    return false;
  }
  
  return true;
}

/**
 * Start the intelligent auto-apply worker system
 */
export function startAutoApplyWorker(): void {
  if (isCoordinatorRunning && isProcessorRunning) {
    console.log("[Work Manager] Worker already running");
    return;
  }

  console.log("[Work Manager] 🚀 Starting intelligent work management system");
  isCoordinatorRunning = true;
  isProcessorRunning = true;
  consecutiveErrors = 0;
  workerStartTime = new Date();
  totalJobsProcessed = 0;

  // Start the work coordinator (checks what work needs to be done)
  coordinateWorkWithErrorHandling();
  coordinatorInterval = setInterval(coordinateWorkWithErrorHandling, WORK_COORDINATOR_INTERVAL_MS);

  // Start the job processor (processes queued jobs)
  processQueuedJobsWithErrorHandling();
  processorInterval = setInterval(processQueuedJobsWithErrorHandling, JOB_PROCESSOR_INTERVAL_MS);

  // Set up heartbeat logging
  heartbeatInterval = setInterval(logWorkerHeartbeat, HEARTBEAT_LOG_INTERVAL);

  // Set up process-level error handlers
  setupGlobalErrorHandlers();

  console.log(`[Work Manager] ✅ Started with intelligent intervals:`);
  console.log(`  - Work Coordinator: every ${WORK_COORDINATOR_INTERVAL_MS / 60000} minutes`);
  console.log(`  - Job Processor: every ${JOB_PROCESSOR_INTERVAL_MS / 1000} seconds`);
  console.log(`  - Job Search Cooldown: ${JOB_SEARCH_COOLDOWN_MS / 60000} minutes per user`);
}

/**
 * Stop the auto-apply worker
 */
export function stopAutoApplyWorker(): void {
  if (!isCoordinatorRunning && !isProcessorRunning) {
    console.log("[Work Manager] Worker not running");
    return;
  }

  console.log("[Work Manager] 🛑 Stopping work management system");
  isCoordinatorRunning = false;
  isProcessorRunning = false;

  if (coordinatorInterval) {
    clearInterval(coordinatorInterval);
    coordinatorInterval = null;
  }

  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
  }

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  // Clear all work states
  userWorkStates.clear();

  console.log("[Work Manager] ✅ Worker stopped successfully");
}

/**
 * 🎯 WORK COORDINATOR - Decides what work needs to be done
 * This runs every 10 minutes and only starts work if needed
 */
async function coordinateWorkWithErrorHandling(): Promise<void> {
  try {
    await coordinateWork();

    // Reset error counter on successful run
    if (consecutiveErrors > 0) {
      console.log(`[Work Manager] Recovered from ${consecutiveErrors} consecutive errors`);
      consecutiveErrors = 0;
    }
    lastSuccessfulRun = new Date();

  } catch (error) {
    consecutiveErrors++;
    console.error(`[Work Manager] Error in work coordinator (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`[Work Manager] Too many consecutive errors. Restarting coordinator in ${ERROR_RECOVERY_DELAY_MS}ms...`);
      
      if (coordinatorInterval) {
        clearInterval(coordinatorInterval);
        coordinatorInterval = null;
      }

      setTimeout(() => {
        if (isCoordinatorRunning) {
          console.log("[Work Manager] Restarting coordinator after error recovery");
          consecutiveErrors = 0;
          coordinatorInterval = setInterval(coordinateWorkWithErrorHandling, WORK_COORDINATOR_INTERVAL_MS);
        }
      }, ERROR_RECOVERY_DELAY_MS);
    }
  }
}

/**
 * 🎯 WORK COORDINATOR - The intelligent decision maker
 */
async function coordinateWork(): Promise<void> {
  // Handle daily cleanup and standby job reactivation
  await checkAndReactivateStandbyJobs();

  // Get all users with auto-apply enabled
  const users = await storage.getAllUsers();
  if (!users?.length) return;

  const enabledUsers = users.filter(user => user.isAutoApplyEnabled);
  if (enabledUsers.length === 0) return;

  console.log(`[Work Manager] 🔍 Checking work needs for ${enabledUsers.length} enabled users`);

  let usersNeedingWork = 0;
  let usersInCooldown = 0;
  let usersWithPendingJobs = 0;

  for (const user of enabledUsers) {
    const state = getUserWorkState(user.id);
    
    // Check if user has remaining applications
    const { getRemainingApplications } = await import("../utils/subscription-utils.js");
    const remainingApplications = await getRemainingApplications(user.id);
    
    if (remainingApplications <= 0) {
      continue; // User has reached daily limit
    }

    // Check if user has pending jobs in queue
    const queuedJobs = await storage.getQueuedJobsForUser(user.id);
    const pendingJobs = queuedJobs.filter(job => job.status === 'pending' || job.status === 'processing');
    
    if (pendingJobs.length > 0) {
      usersWithPendingJobs++;
      continue; // User already has work queued
    }

    // Check if user needs job search
    if (shouldSearchForJobs(user.id)) {
      usersNeedingWork++;
      
      console.log(`[Work Manager] 🔍 User ${user.id} needs job search - starting work`);
      
      // Mark as searching and start the work (DON'T set cooldown yet!)
      state.isSearchingForJobs = true;
      
      try {
        // This is the ONLY place we call startAutoApply - when we actually need it!
        await startAutoApply(user.id);
        
        // Update state after successful search - NO MORE COOLDOWN!
        state.lastJobSearchTime = Date.now();
        state.isSearchingForJobs = false;
        
        console.log(`[Work Manager] ✅ Job search completed for user ${user.id}`);
        
        // Add delay between users to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 10000)); // 10 second delay
        
      } catch (error) {
        console.error(`[Work Manager] Error searching jobs for user ${user.id}:`, error);
        state.isSearchingForJobs = false;
        // NO MORE COOLDOWN ON ERROR - let it retry on next cycle!
      }
    } else {
      usersInCooldown++;
    }
  }

  if (usersNeedingWork > 0 || usersInCooldown > 0 || usersWithPendingJobs > 0) {
    console.log(`[Work Manager] 📊 Work status: ${usersNeedingWork} need work, ${usersInCooldown} in cooldown, ${usersWithPendingJobs} have pending jobs`);
  }
}

/**
 * 🔄 JOB PROCESSOR - Processes queued jobs
 * This runs every 30 seconds and processes actual applications
 */
async function processQueuedJobsWithErrorHandling(): Promise<void> {
  try {
    await processQueuedJobs();
  } catch (error) {
    console.error("[Work Manager] Error in job processor:", error);
  }
}

/**
 * Process the next batch of queued jobs
 */
async function processQueuedJobs(): Promise<void> {
  // Get next batch of pending jobs
  const pendingJobs = await storage.getNextJobsFromQueue(DEFAULT_BATCH_SIZE);

  if (pendingJobs.length === 0) {
    return; // No jobs to process
  }

  console.log(`[Work Manager] 📋 Processing ${pendingJobs.length} queued jobs`);

  // Process each job with proper state management
  for (const queuedJob of pendingJobs) {
    const state = getUserWorkState(queuedJob.userId);
    
    if (!canProcessApplications(queuedJob.userId)) {
      console.log(`[Work Manager] ⏳ User ${queuedJob.userId} in application cooldown, skipping`);
      continue;
    }

    try {
      // Mark as processing
      state.isProcessingApplications = true;
      
      await processJob(queuedJob);
      
      // Update state after successful processing
      state.lastApplicationTime = Date.now();
      state.isProcessingApplications = false;
      
      // Get user's plan for cooldown
      const user = await storage.getUser(queuedJob.userId);
      const userPlan = user?.subscriptionPlan || 'FREE';
      const cooldownMs = APPLY_DELAY_MS[userPlan as keyof typeof APPLY_DELAY_MS] || APPLY_DELAY_MS.FREE;
      state.applicationCooldownEnd = Date.now() + cooldownMs;
      
      totalJobsProcessed++;
      
      console.log(`[Work Manager] ✅ Job processed for user ${queuedJob.userId}, next application in ${cooldownMs/1000}s`);
      
    } catch (error) {
      console.error(`[Work Manager] Error processing job ${queuedJob.id}:`, error);
      state.isProcessingApplications = false;
    }
  }
}

/**
 * Check for users with auto-apply enabled and queue jobs for them
 * 🚨 REMOVED - This was the problematic function causing API credit burnout!
 * Now replaced with intelligent work coordination in coordinateWork()
 */

/**
 * Check if any jobs in standby mode need to be reactivated (daily reset)
 * — and once per UTC‐day run cleanupJobLinks() to demote duplicate postings.
 */
async function checkAndReactivateStandbyJobs(): Promise<void> {
  try {
    // 1) Detect UTC‐day rollover and run dedupe once
    const currentDateString = getUTCDateString(new Date());
    if (currentDateString !== lastCleanupDate) {
      // console.log(
        // `[Auto-Apply Worker] UTC date rolled over ${lastCleanupDate} → ${currentDateString}, running cleanupJobLinks()…`
      // );
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

    // console.log(
      // `[Auto-Apply Worker] Checking ${totalStandbyJobs} standby jobs for reactivation`
    // );

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

        // console.log(
          // `[Auto-Apply Worker] Reactivating ${toReactivate.length} jobs for user ${userId} (${slots} slots left)`
        // );

        for (const job of toReactivate) {
          await storage.updateQueuedJob(job.id, {
            status: 'pending',
            error: null,
            updatedAt: new Date(),
          });
          // TODO: Track statistics for "Reactivated" status instead of logging to auto_apply_logs table
          // await createAutoApplyLog({
          //   userId,
          //   jobId: job.jobId,
          //   status: 'Reactivated',
          //   message: 'Job reactivated after daily application limit reset',
          // });
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
    // Check if this is an application submission job (high priority)
    if (queuedJob.priority >= 100) {
      console.log(`[Work Manager] 🎯 Processing high-priority application job ${queuedJob.id}`);
      
      // Process this as an application submission
      const result = await processQueuedApplication(queuedJob.id);
      
      if (result === 'success') {
        console.log(`[Work Manager] ✅ Application job ${queuedJob.id} completed successfully`);
      } else if (result === 'skipped') {
        console.log(`[Work Manager] ⏭️ Application job ${queuedJob.id} was skipped`);
      } else {
        console.log(`[Work Manager] ❌ Application job ${queuedJob.id} failed`);
      }
      
      return;
    }
    
    // Mark job as processing for regular jobs
    await storage.updateQueuedJob(queuedJob.id, {
      status: 'processing',
      updatedAt: new Date()
    });

    // Get the job details from job_tracker
    const jobDetails = await storage.getJob(queuedJob.jobId);
    if (!jobDetails) {
      await storage.updateQueuedJob(queuedJob.id, {
        status: 'failed',
        error: 'Job details not found',
        processedAt: new Date(),
        updatedAt: new Date()
      });
      return;
    }

    // Get user details
    const user = await storage.getUser(queuedJob.userId);
    if (!user) {
      await storage.updateQueuedJob(queuedJob.id, {
        status: 'failed',
        error: 'User not found',
        processedAt: new Date(),
        updatedAt: new Date()
      });
      return;
    }

    // Process the job using the existing auto-apply service
    // This is for regular job processing (not high-priority application submissions)
    const jobListing: JobListing = {
      jobTitle: jobDetails.jobTitle,
      company: jobDetails.company,
      description: jobDetails.notes || '',
      applyUrl: jobDetails.link || '',
      location: '',
      source: jobDetails.source || 'workable',
      externalJobId: jobDetails.externalJobId || '',
      matchScore: jobDetails.matchScore || 0
    };

    const result = await submitApplication(user, jobListing);

    // Update queue job status
    await storage.updateQueuedJob(queuedJob.id, {
      status: result === 'success' ? 'completed' : 
              result === 'skipped' ? 'skipped' : 'failed',
      error: result === 'error' ? 'Application submission failed' : undefined,
      processedAt: new Date(),
      updatedAt: new Date()
    });

    // Update job tracker
    await storage.updateJob(queuedJob.jobId, {
      applicationStatus: result === 'success' ? 'applied' : 
                        result === 'skipped' ? 'skipped' : 'failed',
      appliedAt: result === 'success' ? new Date() : undefined,
      submittedAt: new Date()
    });

  } catch (error) {
    console.error(`[Work Manager] Error processing job ${queuedJob.id}:`, error);
    
    // Update job as failed
    await storage.updateQueuedJob(queuedJob.id, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      processedAt: new Date(),
      updatedAt: new Date()
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
    // TODO: Track statistics for "Queued" status instead of logging to auto_apply_logs table
    // await Promise.all(
    //   jobIds.map((jobId) =>
    //     createAutoApplyLog({
    //       userId,
    //       jobId,
    //       status: "Queued",
    //       message: "Job added to auto-apply queue",
    //     })
    //   )
    // );

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
  const maxIdleTime = WORK_COORDINATOR_INTERVAL_MS * 3; // If no success for 3 cycles, restart

  // Check if worker appears to be stuck or stopped
  const isHealthy = (isCoordinatorRunning || isProcessorRunning) && consecutiveErrors < MAX_CONSECUTIVE_ERRORS;
  
  if (isHealthy && timeSinceLastSuccess > maxIdleTime) {
    console.warn(`[Work Manager] Worker appears stuck (${Math.floor(timeSinceLastSuccess / 60000)}m since last success). Restarting...`);

    // Force restart
    stopAutoApplyWorker();
    setTimeout(() => {
      startAutoApplyWorker();
    }, 1000);

    return false; // Worker was restarted
  }

  // If worker is not running, start it
  if (!isCoordinatorRunning && !isProcessorRunning) {
    console.log("[Work Manager] Worker not running, starting...");
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
    isRunning: isCoordinatorRunning || isProcessorRunning,
    isCoordinatorRunning,
    isProcessorRunning,
    consecutiveErrors,
    totalJobsProcessed,
    workerStartTime: workerStartTime.toISOString(),
    lastSuccessfulRun: lastSuccessfulRun.toISOString(),
    uptimeMinutes: Math.floor(uptime / 60000),
    minutesSinceLastSuccess: Math.floor(timeSinceLastSuccess / 60000),
    isHealthy: (isCoordinatorRunning || isProcessorRunning) && consecutiveErrors < MAX_CONSECUTIVE_ERRORS,
    maxConsecutiveErrors: MAX_CONSECUTIVE_ERRORS,
    workCoordinatorInterval: WORK_COORDINATOR_INTERVAL_MS,
    jobProcessorInterval: JOB_PROCESSOR_INTERVAL_MS,
    errorRecoveryDelay: ERROR_RECOVERY_DELAY_MS,
    activeWorkStates: userWorkStates.size,
    userWorkStates: Object.fromEntries(userWorkStates.entries())
  };
}

/**
 * Get the auto-apply status for a user
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

    // Get user work state
    const workState = getUserWorkState(userId);

    // Determine current status
    let currentStatus = "Completed";
    if (workState.isSearchingForJobs) {
      currentStatus = "Searching for Jobs";
    } else if (workState.isProcessingApplications || processing > 0) {
      currentStatus = "Processing Applications";
    } else if (pending > 0) {
      currentStatus = "Jobs Queued";
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
    } else if (workState.applicationCooldownEnd > Date.now()) {
      const cooldownSeconds = Math.ceil((workState.applicationCooldownEnd - Date.now()) / 1000);
      latestMessage = `Application cooldown: ${cooldownSeconds} seconds remaining.`;
    }

    return {
      currentStatus,
      isWorkerRunning: isCoordinatorRunning || isProcessorRunning,
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
      // Enhanced work state information
      workState: {
        isSearchingForJobs: workState.isSearchingForJobs,
        isProcessingApplications: workState.isProcessingApplications,
        lastJobSearchTime: workState.lastJobSearchTime ? new Date(workState.lastJobSearchTime).toISOString() : null,
        lastApplicationTime: workState.lastApplicationTime ? new Date(workState.lastApplicationTime).toISOString() : null,
        applicationCooldownEnd: workState.applicationCooldownEnd ? new Date(workState.applicationCooldownEnd).toISOString() : null,
      },
      // Worker health information
      workerHealth: {
        consecutiveErrors,
        lastSuccessfulRun: lastSuccessfulRun.toISOString(),
        totalJobsProcessed,
        uptimeMinutes: Math.floor((Date.now() - workerStartTime.getTime()) / 60000),
        isHealthy: consecutiveErrors < MAX_CONSECUTIVE_ERRORS,
        isCoordinatorRunning,
        isProcessorRunning
      }
    };
  } catch (error) {
    console.error(
      `[Work Manager] Error getting status for user ${userId}:`,
      error
    );
    throw error;
  }
}

/**
 * Set up global error handlers to prevent the worker from crashing
 */
function setupGlobalErrorHandlers(): void {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[Work Manager] Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('[Work Manager] Uncaught Exception:', error);
    // Don't exit the process, just log the error
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

  console.log(`[Work Manager] 💓 Heartbeat - Uptime: ${uptimeMinutes}m, Jobs processed: ${totalJobsProcessed}, Last success: ${minutesSinceSuccess}m ago, Errors: ${consecutiveErrors}`);
  
  // Log work state summary
  const activeUsers = Array.from(userWorkStates.values()).filter(state => 
    state.isSearchingForJobs || state.isProcessingApplications
  );
  
  if (activeUsers.length > 0) {
    console.log(`[Work Manager] 📊 Active users: ${activeUsers.length} (${activeUsers.map(s => 
      `User ${s.userId}: ${s.isSearchingForJobs ? 'searching' : ''}${s.isProcessingApplications ? 'processing' : ''}`
    ).join(', ')})`);
  }
}

// Start the worker when the server starts up
startAutoApplyWorker();