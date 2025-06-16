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
 */
export async function queueJobApplication(payload: JobApplicationPayload): Promise<ApplicationQueueResult> {
  try {
    // First, ensure the job exists in the job_tracker table
    let jobRecord = await storage.getJobByExternalId(payload.job.externalJobId || '');
    
    if (!jobRecord) {
      // Create the job record if it doesn't exist
      jobRecord = await storage.addJobToTracker({
        userId: payload.user.id,
        jobTitle: payload.job.jobTitle,
        company: payload.job.company,
        link: payload.job.applyUrl,
        status: 'saved',
        externalJobId: payload.job.externalJobId || '',
        matchScore: payload.matchScore,
        source: payload.job.source || 'workable'
      });
    }

    // Create application queue entry with high priority for immediate processing
    const queuedJob = await storage.enqueueJob({
      userId: payload.user.id,
      jobId: jobRecord.id,
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

    // Submit to Playwright worker with no timeout constraints
    // The worker can take as long as it needs
    const result = await submitToPlaywrightWorker(payload);

    // Update job status based on result
    await storage.updateQueuedJob(queuedJobId, {
      status: result === 'success' ? 'completed' : 
              result === 'skipped' ? 'skipped' : 'failed',
      error: result === 'error' ? 'Application submission failed' : undefined,
      processedAt: new Date(),
      updatedAt: new Date()
    });

    // Update the job tracker record if we have a job ID
    const queuedJob = await storage.getQueuedJob(queuedJobId);
    if (queuedJob?.jobId) {
      await storage.updateJobInTracker(queuedJob.jobId, {
        applicationStatus: result === 'success' ? 'applied' : 
                          result === 'skipped' ? 'skipped' : 'failed',
        appliedAt: result === 'success' ? new Date() : undefined,
        submittedAt: new Date()
      });
    }

    // Clean up the payload data
    await storage.deleteApplicationPayload(queuedJobId);

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
 * Submit to Playwright worker without timeout constraints
 * 
 * This is the fire-and-forget version that doesn't worry about timeouts.
 * The job queue system handles retries and failure recovery.
 */
async function submitToPlaywrightWorker(payload: any): Promise<'success' | 'skipped' | 'error'> {
  try {
    const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
    if (!workerUrl) {
      throw new Error("No Playwright worker URL configured");
    }

    const completeWorkerUrl = workerUrl.startsWith("http") ? workerUrl : `https://${workerUrl}`;

    // Prepare the payload for the Playwright worker
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
      },
      matchScore: payload.matchScore,
      formData: payload.formData
    };

    console.log(`🔄 Submitting application to Playwright worker (no timeout): ${payload.job.jobTitle} at ${payload.job.company}`);

    // Make the request with a very long timeout (30 minutes)
    // This is acceptable since we're now running async
    const response = await fetch(`${completeWorkerUrl}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(workerPayload),
      // 30 minute timeout - much more reasonable for async processing
      signal: AbortSignal.timeout(30 * 60 * 1000)
    });

    if (!response.ok) {
      console.error(`Playwright worker returned status ${response.status}`);
      return 'error';
    }

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ Application submitted successfully: ${payload.job.jobTitle} at ${payload.job.company}`);
      return 'success';
    } else if (result.skipped) {
      console.log(`⏭️ Application skipped: ${payload.job.jobTitle} at ${payload.job.company} - ${result.reason || 'Unknown reason'}`);
      return 'skipped';
    } else {
      console.error(`❌ Application failed: ${payload.job.jobTitle} at ${payload.job.company} - ${result.error || 'Unknown error'}`);
      return 'error';
    }

  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error('Playwright worker timed out after 30 minutes - this indicates a serious issue with the worker');
    } else {
      console.error('Error submitting to Playwright worker:', error);
    }
    return 'error';
  }
} 