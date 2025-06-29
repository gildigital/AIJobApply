/**
 * Job Application Queue Service
 * 
 * This service implements an async job queue pattern to fix the catastrophic
 * timeout errors in the synchronous submitWorkableApplication function.
 * 
 * Instead of waiting for long-running Playwright browser automation tasks,
 * this service:
 * 1. Immediately queues the job with all necessary data
 * 2. Returns a job ID for tracking
 * 3. Processes jobs asynchronously via the existing job queue system
 * 4. Updates job status in the database when complete
 */

import { storage } from "../storage.js";
import type { JobTracker, User } from "@shared/schema.js";

// Import JobListing from the correct service
export interface JobListing {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  location: string;
  source: string;
  externalJobId?: string;
  matchScore?: number;
}

export interface JobApplicationPayload {
  user: User;
  resume: any;
  profile: any;
  job: JobListing;
  matchScore: number;
  formData: any; // Pre-processed form data from the introspection phase
}

export interface ApplicationQueueResult {
  success: boolean;
  queuedJobId?: number;
  message: string;
}

/**
 * Queue a job application for asynchronous processing
 * 
 * This replaces the synchronous submitWorkableApplication approach
 * with an async queue-based pattern that eliminates timeout issues.
 * 
 * ✨ NEW APPROACH: No job tracker record is created until application succeeds!
 */
export async function queueJobApplication(payload: JobApplicationPayload): Promise<ApplicationQueueResult> {
  try {
    // ✨ REMOVED: No longer create job tracker record upfront
    // Job tracker records are only created when applications succeed (in callback)
    
    // Create application queue entry WITHOUT a jobId (will be set in callback)
    const queuedJob = await storage.enqueueJob({
      userId: payload.user.id,
      // jobId: undefined, // Will be set when job tracker record is created on success
      priority: 100, // High priority for application submissions
      status: 'pending',
      attemptCount: 0
    });

    // Store the application payload in a separate table for the worker to access
    // This contains all the data needed for the Playwright worker
    await storage.createApplicationPayload(queuedJob.id, {
      user: payload.user,
      resume: payload.resume,
      profile: payload.profile,
      job: payload.job,
      matchScore: payload.matchScore,
      formData: payload.formData
    });

    return {
      success: true,
      queuedJobId: queuedJob.id,
      message: `Job application queued successfully. Queue ID: ${queuedJob.id}`
    };

  } catch (error) {
    console.error('Error queueing job application:', error);
    return {
      success: false,
      message: `Failed to queue job application: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Get the status of a queued job application
 */
export async function getApplicationStatus(queuedJobId: number): Promise<{
  status: string;
  error?: string;
  processedAt?: Date;
  result?: 'success' | 'skipped' | 'failed';
}> {
  try {
    const queuedJob = await storage.getQueuedJob(queuedJobId);
    
    if (!queuedJob) {
      return { status: 'not_found' };
    }

    return {
      status: queuedJob.status,
      error: queuedJob.error || undefined,
      processedAt: queuedJob.processedAt || undefined,
      result: queuedJob.status === 'completed' ? 'success' : 
              queuedJob.status === 'failed' ? 'failed' :
              queuedJob.status === 'skipped' ? 'skipped' : undefined
    };

  } catch (error) {
    console.error('Error getting application status:', error);
    return { status: 'error', error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Process a single queued job application
 * 
 * This function is called by the job queue worker and handles the actual
 * submission to the Playwright worker without timeout constraints.
 */
export async function processQueuedApplication(queuedJobId: number): Promise<'success' | 'skipped' | 'error'> {
  try {
    // Mark job as processing
    await storage.updateQueuedJob(queuedJobId, {
      status: 'processing',
      updatedAt: new Date()
    });

    // Get the application payload
    const payload = await storage.getApplicationPayload(queuedJobId);
    if (!payload) {
      await storage.updateQueuedJob(queuedJobId, {
        status: 'failed',
        error: 'Application payload not found',
        processedAt: new Date(),
        updatedAt: new Date()
      });
      return 'error';
    }

    // Get queued job for IDs  
    const queuedJob = await storage.getQueuedJob(queuedJobId);
    
    // Submit to Playwright worker with callback configuration
    // ✨ CHANGED: jobId will be null since we don't create job tracker record until success
    const payloadWithIds = {
      ...payload,
      queueId: queuedJobId,
      jobId: null // Will be created in callback when application succeeds
    };
    
    const result = await submitToPlaywrightWorker(payloadWithIds);

    // For async processing, we only update to 'processing' status
    // The worker will call back with final status
    await storage.updateQueuedJob(queuedJobId, {
      status: 'processing',
      processedAt: new Date(),
      updatedAt: new Date()
    });

    // 🐛 BUG FIX: Don't delete payload here! Move to callback handler after successful processing
    // The payload needs to remain available for the worker callback to create job tracker records
    // await storage.deleteApplicationPayload(queuedJobId);

    return result;

  } catch (error) {
    console.error(`Error processing queued application ${queuedJobId}:`, error);
    
    // Update job as failed
    await storage.updateQueuedJob(queuedJobId, {
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      processedAt: new Date(),
      updatedAt: new Date()
    });

    return 'error';
  }
}

/**
 * Wake up the Playwright worker and wait for it to be ready
 */
async function wakeUpWorker(workerUrl: string): Promise<boolean> {
  const MAX_WAKE_ATTEMPTS = 6; // Try for up to 3 minutes
  const WAKE_DELAYS = [5000, 10000, 15000, 20000, 30000, 30000]; // Progressive delays
  
  console.log('🏓 Pinging worker to wake it up...');
  
  for (let attempt = 0; attempt < MAX_WAKE_ATTEMPTS; attempt++) {
    try {
      const pingStart = Date.now();
      const response = await fetch(`${workerUrl}/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(10000) // 10 second timeout per ping
      });
      
      const pingTime = Date.now() - pingStart;
      
      if (response.ok) {
        const status = await response.json();
        const isReady = !status.rateLimiter?.systemHealth?.isThrottled && 
                        status.queueHealth?.active < status.queueHealth?.maxConcurrent;
        
        if (isReady) {
          console.log(`✅ Worker is awake and ready! (${pingTime}ms response time)`);
          return true;
        } else {
          console.log(`⏳ Worker responding but busy (attempt ${attempt + 1}/${MAX_WAKE_ATTEMPTS}, ${pingTime}ms)`);
        }
      } else {
        console.log(`🥶 Worker still starting up: ${response.status} (attempt ${attempt + 1}/${MAX_WAKE_ATTEMPTS})`);
      }
      
    } catch (error) {
      console.log(`🔄 Wake ping failed (attempt ${attempt + 1}/${MAX_WAKE_ATTEMPTS}): ${error.message}`);
    }
    
    // Wait before next attempt (unless it's the last one)
    if (attempt < MAX_WAKE_ATTEMPTS - 1) {
      const delay = WAKE_DELAYS[attempt];
      console.log(`⏳ Waiting ${delay/1000}s before next ping...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  console.log('❌ Worker did not become ready after all wake attempts');
  return false;
}

/**
 * Enhanced submission with worker wake-up
 */
async function submitToPlaywrightWorker(payload: any): Promise<'success' | 'skipped' | 'error'> {
  try {
    const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
    const mainServerUrl = process.env.VITE_BACKEND_URL;
    const sharedSecret = process.env.WORKER_SHARED_SECRET;
    
    if (!workerUrl || !mainServerUrl || !sharedSecret) {
      throw new Error("Missing worker configuration");
    }

    const completeWorkerUrl = workerUrl.startsWith("http") ? workerUrl : `https://${workerUrl}`;

    // 🏓 STEP 1: Wake up the worker first!
    console.log(`🏓 Waking up worker before job submission...`);
    const isAwake = await wakeUpWorker(completeWorkerUrl);
    
    if (!isAwake) {
      throw new Error("Worker failed to wake up after multiple attempts");
    }

    // 🎯 STEP 2: Submit the actual job (worker is now ready)
    const workerPayload = {
      user: {
        id: payload.user.id,
        name: payload.user.name,
        email: payload.user.email,
        phone: payload.user.phone,
        resumeText: payload.user.resumeText,
      },
      resume: payload.resume ? {
        id: payload.resume.id,
        filename: payload.resume.filename,
        contentType: payload.resume.contentType,
        fileContent: payload.resume.fileContent,
      } : null,
      profile: payload.profile,
      job: {
        jobTitle: payload.job.jobTitle,
        company: payload.job.company,
        description: payload.job.description,
        applyUrl: payload.job.applyUrl,
        location: payload.job.location,
        source: payload.job.source,
        externalJobId: payload.job.externalJobId,
        _jobLinkId: payload.job._jobLinkId,
      },
      matchScore: payload.matchScore,
      formData: payload.formData,
      callback: {
        url: `${mainServerUrl}/api/worker/update-job-status`,
        secret: sharedSecret,
        queueId: payload.queueId,  // job_queue.id
        jobId: payload.jobId,      // job_tracker.id  
        userId: payload.user.id
      }
    };

    console.log(`🔄 Submitting application to Playwright worker (async): ${payload.job.jobTitle} at ${payload.job.company}`);

    const response = await fetch(`${completeWorkerUrl}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(workerPayload),
      signal: AbortSignal.timeout(30000) // 30 second timeout for handoff
    });

    if (response.status === 202) {
      console.log(`✅ Job queued successfully in worker`);
      return 'success';
    }
    
    throw new Error(`Worker rejected job even after wake-up: ${response.status}`);

  } catch (error) {
    console.error('Error submitting to Playwright worker:', error);
    return 'error';
  }
} 