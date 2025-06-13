import { db } from "../db.js";
import { jobTracker, autoApplyLogs, users, InsertJobTracker, InsertAutoApplyLog } from "@shared/schema.js";
import { eq, and, gte, sql, or } from "drizzle-orm";
import { storage } from "../storage.js";
import { fetchJobDescription } from "./job-description-scraper.js";

/**
 * Import the Workable job functions - use the integrated version that supports both
 * pagination and infinite scrolling implementations
 */
import { workableScraper } from "./workable-scraper.js";
import { getWorkableJobsForUser } from "./workable-scroll-integration.js";

/**
 * Represents a job listing from an external source
 */
export interface JobListing {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  location: string;        // Required location field for consistency with job-scraper.ts
  postedAt?: string;
  source: string;          // Required source field (workable, adzuna, etc.)
  externalJobId: string;   // Required unique identifier from the source
  matchScore?: number;     // Score indicating how well the job matches the user's profile
  _needsProcessing?: boolean; // Flag to indicate this job needs details fetched
  _jobLinkId?: number;    // ID of the corresponding job link in database
}

/**
 * Starts the auto-apply process for a user
 * @param userId The ID of the user to auto-apply for
 * @returns A message indicating the result of the operation
 */
export async function startAutoApply(userId: number): Promise<string> {
  try {
    // Validate that the user exists
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Log the start of the auto-apply process
    await createAutoApplyLog({
      userId,
      status: "Started",
      message: "Auto-apply process started"
    });

    // Check subscription and daily limits
    const { checkSubscriptionAccess } = await import("../utils/subscription-utils.js");
    const result = await checkSubscriptionAccess(userId);
    
    if (!result.allowed) {
      await createAutoApplyLog({
        userId,
        status: "Failed",
        message: `Auto-apply failed: ${result.reason}`
      });
      return `Auto-apply failed: ${result.reason}`;
    }

    // Get remaining applications allowed today
    const { getRemainingApplications } = await import("../utils/subscription-utils.js");
    const remainingApplications = await getRemainingApplications(userId);
    
    if (remainingApplications <= 0) {
      await createAutoApplyLog({
        userId,
        status: "Failed",
        message: "Daily application limit reached"
      });
      return "Daily application limit reached";
    }

    // Process asynchronously (TODO: this must be a background worker)
    processAutoApply(userId, remainingApplications).catch(err => {
      console.error("Error in auto-apply process:", err);
    });

    return "Auto-apply process started";
  } catch (error: any) {
    console.error("Error starting auto-apply:", error);
    
    // Log the error
    await createAutoApplyLog({
      userId,
      status: "Error",
      message: `Auto-apply error: ${error.message}`
    });
    
    throw error;
  }
}

/**
 * Process the auto-apply workflow for a user
 * This would run in a background worker in a production environment
 */
async function processAutoApply(userId: number, maxApplications: number): Promise<void> {
  try {
    // Update user's status 
    await createAutoApplyLog({
      userId,
      status: "Searching",
      message: "Searching for matching jobs"
    });

    // Get job listings for user
    const jobs = await getJobListingsForUser(userId);
    
    if (jobs.length === 0) {
      await createAutoApplyLog({
        userId,
        status: "Completed",
        message: "No matching jobs found"
      });
      return;
    }

    await createAutoApplyLog({
      userId,
      status: "Processing",
      message: `Found ${jobs.length} potential job matches`
    });

    // Get the user profile to use for job matching
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Track how many applications we've processed
    let applicationsSubmitted = 0;

    // Process each job
    for (const job of jobs) {
      // Fetch the latest user record before each job to check the current isAutoApplyEnabled flag
      const latestUser = await storage.getUser(userId);
      if (!latestUser) {
        await createAutoApplyLog({
          userId,
          status: "Error",
          message: "User not found during job processing"
        });
        return;
      }
      if (!latestUser.isAutoApplyEnabled) {
        await createAutoApplyLog({
          userId,
          status: "Stopped",
          message: `Auto-apply stopped: isAutoApplyEnabled is false in DB before processing job at ${job.company} - ${job.jobTitle}`
        });
        console.log(`Auto-apply stopped for user ${userId}: isAutoApplyEnabled is false in DB before processing job at ${job.company} - ${job.jobTitle}`);
        return;
      }

      // Stop if we've reached the limit
      if (applicationsSubmitted >= maxApplications) {
        await createAutoApplyLog({
          userId,
          status: "Completed",
          message: `Daily limit of ${maxApplications} applications reached`
        });
        return;
      }

      // If this job needs processing (i.e., it's just a link), fetch the details now
      if (job._needsProcessing && job._jobLinkId) {
        await createAutoApplyLog({
          userId,
          status: "Processing",
          message: `Fetching job details from ${job.applyUrl}`
        });

        try {
          // Mark the job link as being processed
          await storage.updateJobLink(job._jobLinkId, { 
            status: 'processing',
            attemptCount: 1 
          });

          // Fetch job details using the direct fetch API
          const VITE_BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:5000";
          const apiUrl = `${VITE_BACKEND_URL}/api/workable/direct-fetch?url=${encodeURIComponent(job.applyUrl)}`;
          
          console.log(`Fetching Workable job from URL: ${job.applyUrl}`);
          const response = await fetch(apiUrl);
          
          if (!response.ok) {
            console.error(`Failed to fetch job details (${job.applyUrl}): ${response.status} ${response.statusText}`);
            
            if (response.status === 429) {
              // Rate limited - mark as failed and continue
              await storage.updateJobLink(job._jobLinkId, { 
                status: 'failed',
                error: 'Rate limited (429)',
                processedAt: new Date()
              });
              
              await createAutoApplyLog({
                userId,
                status: "Skipped",
                message: `Rate limited when fetching job details from ${job.applyUrl}`
              });
              continue;
            } else {
              // Other error - mark as failed and continue
              await storage.updateJobLink(job._jobLinkId, { 
                status: 'failed',
                error: `HTTP ${response.status}: ${response.statusText}`,
                processedAt: new Date()
              });
              
              await createAutoApplyLog({
                userId,
                status: "Skipped",
                message: `Failed to fetch job details from ${job.applyUrl}: ${response.statusText}`
              });
              continue;
            }
          }

          const data = await response.json();
          
          if (data.success && data.job) {
            // Update the job object with fetched details
            job.jobTitle = data.job.title;
            job.company = data.job.company;
            job.description = data.job.description || 'No description available';
            job.location = data.job.location || 'Remote';
            
            // Mark job link as processed
            await storage.markJobLinkAsProcessed(job._jobLinkId);
            
            console.log(`Successfully fetched job details: ${job.jobTitle} at ${job.company}`);
          } else {
            // Invalid data - mark as failed and continue
            await storage.updateJobLink(job._jobLinkId, { 
              status: 'failed',
              error: 'Invalid job data received',
              processedAt: new Date()
            });
            
            await createAutoApplyLog({
              userId,
              status: "Skipped",
              message: `Invalid job data received from ${job.applyUrl}`
            });
            continue;
          }
        } catch (error: any) {
          console.error(`Error fetching job details for ${job.applyUrl}:`, error);
          
          // Mark as failed and continue
          if (job._jobLinkId) {
            await storage.updateJobLink(job._jobLinkId, { 
              status: 'failed',
              error: error.message || 'Unknown error',
              processedAt: new Date()
            });
          }
          
          await createAutoApplyLog({
            userId,
            status: "Skipped",
            message: `Error fetching job details from ${job.applyUrl}: ${error.message}`
          });
          continue;
        }
      }

      // Check if we've already applied to this job
      const existingJob = await checkForExistingApplication(userId, job);
      if (existingJob) {
        await createAutoApplyLog({
          userId,
          status: "Skipped",
          message: `Already applied to ${job.company} - ${job.jobTitle}`
        });
        continue;
      }

      // Ensure job.description is present before scoring
      if (!job.description || job.description.trim().length < 30) {
        const desc = await fetchJobDescription(job.applyUrl);
        if (desc && desc.length > 0) {
          job.description = desc;
        }
      }
      // Score the job fit using AI-powered matching
      let matchResult;
      try {
        const { scoreJobFit: aiScoreJobFit } = await import('./job-matching-service.js');
        matchResult = await aiScoreJobFit(user.id, job);
        console.log(`AI score for ${job.jobTitle}: ${matchResult.matchScore}% - Reasons: ${matchResult.reasons.join(', ')}`);
      } catch (error) {
                 console.error("Error with AI job scoring, falling back to basic scoring:", error);
         const fallbackScore = await scoreJobFit(user, job);
         matchResult = {
           matchScore: fallbackScore,
           reasons: ["Scoring calculated using keyword matching", "Upload a resume for AI-powered matching"]
         };
      }
      
      // Log the evaluation
      await createAutoApplyLog({
        userId,
        status: "Evaluating",
        message: `Evaluating match for ${job.company} - ${job.jobTitle} (Score: ${matchResult.matchScore}%)`
      });

      // Get user's preferred match score threshold or use default
      const profile = await storage.getUserProfile(userId);
      const matchScoreThreshold = profile?.matchScoreThreshold || 70;
      
      // Only apply if the score meets or exceeds the threshold
      if (matchResult.matchScore >= matchScoreThreshold) {
        try {
          // Submit the application based on job source
          const result = await submitApplication(user, job);
          
          // Create job tracker entry with appropriate application status
          let status = "Applied";
          let applicationStatus = "pending";
          let message = `Evaluating application to ${job.company} - ${job.jobTitle}`;
          
          // Handle different submission results
          console.log(`[AUTO-APPLY-DEBUG] Got result '${result}' from workable-application.ts`);
          switch (result) {
            case "success":
              status = "Applied";
              applicationStatus = "applied";
              message = `Successfully applied to ${job.company} - ${job.jobTitle}`;
              applicationsSubmitted++;
              console.log(`[AUTO-APPLY-DEBUG] Setting status to "${status}", applicationStatus to "${applicationStatus}"`);
              break;
            case "skipped":
              status = "Saved";
              applicationStatus = "skipped";
              message = `Skipped ${job.company} - ${job.jobTitle} due to unsupported application process`;
              console.log(`[AUTO-APPLY-DEBUG] Setting status to "${status}", applicationStatus to "${applicationStatus}"`);
              break;
            case "error":
              status = "Failed";
              applicationStatus = "failed";
              message = `Failed to apply to ${job.company} - ${job.jobTitle}`;
              console.log(`[AUTO-APPLY-DEBUG] Setting status to "${status}", applicationStatus to "${applicationStatus}"`);
              break;
          }
          
          // Add to job tracker with the match score and application status
          const jobRecord = await addJobToTracker(
            userId, 
            job, 
            matchResult.matchScore, 
            status,
            matchResult.reasons.join('\n'),
            applicationStatus // Pass the application status
          );
          
          // Add detailed logging before creating the log
          console.log(`[AUTO-APPLY-DEBUG] Creating log entry with status: ${result === "success" ? "Applied" : (result === "skipped" ? "Skipped" : "Failed")}`);
          
          // Log the application attempt
          await createAutoApplyLog({
            userId,
            jobId: jobRecord.id,
            status: result === "success" ? "Applied" : (result === "skipped" ? "Skipped" : "Failed"),
            message
          });
          
          console.log(`[AUTO-APPLY-DEBUG] Log entry created with message: ${message}`);
          
          // Add a small delay between applications to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          // Even if the application fails, we should still track the job with its match score
          // This ensures we can see the match score for failed applications
          try {
            const jobRecord = await addJobToTracker(
              userId, 
              job, 
              matchResult.matchScore, 
              "Error", 
              matchResult.reasons.join('\n'), 
              "failed"
            );
            
            await createAutoApplyLog({
              userId,
              jobId: jobRecord.id,
              status: "Error",
              message: `Failed to apply to ${job.company} - ${job.jobTitle}: ${error.message}`
            });
          } catch (trackingError) {
            console.error("Error tracking failed job:", trackingError);
            
            await createAutoApplyLog({
              userId,
              status: "Error",
              message: `Failed to apply to ${job.company} - ${job.jobTitle}: ${error.message}`
            });
          }
        }
      } else {
        // Track the low-match score job but mark it as skipped
        const jobRecord = await addJobToTracker(
          userId, 
          job, 
          matchResult.matchScore, 
          "Skipped", 
          matchResult.reasons.join('\n'), 
          "skipped"
        );
        
        await createAutoApplyLog({
          userId,
          jobId: jobRecord.id,
          status: "Skipped",
          message: `Skipped job at ${job.company} - ${job.jobTitle} (Score: ${matchResult.matchScore}, Threshold: ${matchScoreThreshold})`
        });
      }
    }

    // Final status update
    await createAutoApplyLog({
      userId,
      status: "Completed",
      message: `Auto-apply completed. Applied to ${applicationsSubmitted} jobs.`
    });
  } catch (error: any) {
    console.error("Error in auto-apply process:", error);
    
    // Log the error
    await createAutoApplyLog({
      userId,
      status: "Error",
      message: `Auto-apply process error: ${error.message}`
    });
  }
}

/**
 * Gets job listings for a user by first scraping links, then processing them one by one
 * This replaces the old approach of fetching all job details at once
 */
export async function getJobListingsForUser(userId: number): Promise<JobListing[]> {
  try {
    // Get the user record
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }
    
    // Get the user profile to access preferences
    const profile = await storage.getUserProfile(userId);
    if (!profile) {
      console.log(`No profile found for user ${userId}, using default preferences`);
    }
    
    // Log profile data for debugging
    console.log(`User ${userId} profile preferences:`, {
      jobTitles: profile?.jobTitlesOfInterest || [],
      locations: profile?.locationsOfInterest || [],
      remotePreference: profile?.preferredWorkArrangement,
      excludedCompanies: profile?.excludedCompanies || []
    });
    
    // First, check if we have pending job links to process
    const pendingJobLinksCount = await storage.getPendingJobLinksCount(userId);
    console.log(`Found ${pendingJobLinksCount} pending job links for user ${userId}`);
    
    if (pendingJobLinksCount === 0) {
      // No pending links, scrape for new ones
      console.log(`No pending job links found, scraping for new jobs for user ${userId}...`);
      const workableJobs = await getWorkableJobsForUser(userId);
      console.log(`Scraping completed, found ${workableJobs.length} job placeholders from Workable`);
      
      // Check again for pending links after scraping
      const newPendingCount = await storage.getPendingJobLinksCount(userId);
      console.log(`After scraping, found ${newPendingCount} pending job links`);
      
      if (newPendingCount === 0) {
        console.log("No new job links found after scraping");
        return [];
      }
    }
    
    // Now process job links one at a time
    // Get multiple pending links since we'll process them one by one in processAutoApply
    const pendingLinks = await storage.getNextJobLinksToProcess(userId, 50); // Get up to 50 links to process
    console.log(`Retrieved ${pendingLinks.length} job links for processing`);
    
    if (pendingLinks.length === 0) {
      return [];
    }
    
    // Convert pending links to JobListing objects for processing
    const jobListings: JobListing[] = pendingLinks.map(link => ({
      jobTitle: 'Processing Job Link', // Placeholder - will be fetched during processing
      company: 'Pending',
      description: 'Job details will be fetched during application process',
      applyUrl: link.url,
      location: 'Remote',
      source: link.source,
      externalJobId: link.externalJobId || undefined,
      // Add a special flag to indicate this needs processing
      _needsProcessing: true,
      _jobLinkId: link.id
    }));
    
    return jobListings;
  } catch (error) {
    // Log the error but don't fail the entire process
    console.error("Error getting job listings:", error);
    
    // Return an empty array rather than using mock data
    console.log("Error occurred, no jobs will be processed");
    return [];
  }
}

/**
 * Checks if a user has already applied to a job with the same external ID
 */
async function checkForExistingApplication(userId: number, job: JobListing): Promise<boolean> {
  // We need to filter by both userId and job details,
  // but also only consider a job as already applied if it has a status of "applied"
  // or "submitted" rather than just "pending", which was used for testing

  if (!job.externalJobId) {
    // If there's no external ID, check by company and title
    const [existingJob] = await db
      .select()
      .from(jobTracker)
      .where(
        and(
          eq(jobTracker.userId, userId),
          eq(jobTracker.company, job.company),
          eq(jobTracker.jobTitle, job.jobTitle),
          // Only consider jobs that were actually submitted through Playwright worker
          // (applicationStatus will be "applied" or "submitted" rather than "pending")
          and(
            eq(jobTracker.status, "Applied"),
            or(
              eq(jobTracker.applicationStatus, "applied"),
              eq(jobTracker.applicationStatus, "submitted")
            )
          )
        )
      )
      .limit(1);
    
    return !!existingJob;
  }
  
  // Check by external job ID
  const [existingJob] = await db
    .select()
    .from(jobTracker)
    .where(
      and(
        eq(jobTracker.userId, userId),
        eq(jobTracker.externalJobId, job.externalJobId),
        // Only consider jobs that were actually submitted through Playwright worker
        // (applicationStatus will be "applied" or "submitted" rather than "pending")
        and(
          eq(jobTracker.status, "Applied"),
          or(
            eq(jobTracker.applicationStatus, "applied"),
            eq(jobTracker.applicationStatus, "submitted")
          )
        )
      )
    )
    .limit(1);
  
  const isAlreadyApplied = !!existingJob;
  
  if (isAlreadyApplied) {
    console.log(`Found existing application for ${job.company} - ${job.jobTitle} with status ${existingJob.applicationStatus}`);
  }
  
  return isAlreadyApplied;
}

/**
 * Scores how well a job matches a user's profile
 * Uses direct keyword matching for scoring job fits more accurately
 */
export async function scoreJobFit(user: any, job: JobListing): Promise<number> {
  try {
    // Use the AI-powered job scoring system for more accurate results
    const { scoreJobFit: aiScoreJobFit } = await import('./job-matching-service.js');
    
    console.log(`Using AI-powered scoring for ${job.jobTitle} at ${job.company}`);
    const matchResult = await aiScoreJobFit(user.id, job);
    
    console.log(`AI score for ${job.jobTitle}: ${matchResult.matchScore}% - Reasons: ${matchResult.reasons.join(', ')}`);
    return matchResult.matchScore;
  } catch (error) {
    console.error("Error with AI job scoring, falling back to keyword matching:", error);
    
    // Fallback to keyword matching if AI scoring fails
    try {
      // Get the user's resume content
      const resume = await storage.getResume(user.id);
      if (!resume || !resume.parsedText) {
        // Without resume data, we return a low score to encourage resume upload
        console.log("No resume found, returning low score to encourage resume upload");
        return 25;
      }

      // Extract keywords from both resume and job description
      const resumeKeywords = extractKeywords(resume.parsedText);
      const jobKeywords = extractKeywords(job.description);
      
      // Calculate the match score using improved algorithm
      const score = calculateMatchScore(resumeKeywords, jobKeywords, job.description, job.jobTitle);
      console.log(`Fallback keyword score for ${job.jobTitle}: ${score}%`);
      return score;
    } catch (fallbackError) {
      console.error("Error in fallback scoring algorithm:", fallbackError);
      
      // Last resort: return a low score
      console.log("All scoring methods failed, returning minimal score");
      return 15;
    }
  }
}

/**
 * Extract keywords from text for better job matching
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // Convert to lowercase for case-insensitive matching
  const lowercaseText = text.toLowerCase();
  
  // Common tech keywords to look for
  const techKeywords = [
    "javascript", "typescript", "python", "java", "c#", "go", "rust", "ruby", 
    "react", "angular", "vue", "node", "express", "django", "flask", "spring",
    "aws", "azure", "gcp", "docker", "kubernetes", "devops", "ci/cd",
    "sql", "postgresql", "mysql", "mongodb", "database", "nosql",
    "frontend", "backend", "fullstack", "full-stack", "software engineer", "developer",
    "html", "css", "sass", "less", "tailwind", "bootstrap", "material-ui",
    "redux", "mobx", "recoil", "context", "graphql", "rest", "api",
    "agile", "scrum", "kanban", "jira", "confluence", "git", "github", "gitlab",
    "jenkins", "travis", "circle", "testing", "jest", "mocha", "cypress", "selenium"
  ];
  
  // Filter keywords that appear in the text
  return techKeywords.filter(keyword => lowercaseText.includes(keyword));
}

/**
 * Calculate a match score based on keyword matching and other factors
 */
function calculateMatchScore(
  resumeKeywords: string[], 
  jobKeywords: string[], 
  jobDescription: string,
  jobTitle: string
): number {
  // If we have no keywords from either source, return a low score
  if (resumeKeywords.length === 0 && jobKeywords.length === 0) {
    console.log("No keywords found in resume or job description");
    return 20;
  }
  
  // If we have no resume keywords, return a very low score
  if (resumeKeywords.length === 0) {
    console.log("No keywords found in resume");
    return 15;
  }
  
  // If we have no job keywords, we can't properly score but give a moderate score
  if (jobKeywords.length === 0) {
    console.log("No keywords found in job description, using moderate score");
    return 40;
  }

  // Base factors for scoring
  let score = 0; // Start with zero and build up
  
  // 1. Calculate keyword match percentage (60% weight)
  const uniqueJobKeywords = Array.from(new Set(jobKeywords));
  const uniqueResumeKeywords = Array.from(new Set(resumeKeywords));
  
  // Count keywords that match between resume and job
  const matchingKeywords = uniqueResumeKeywords.filter(keyword => 
    uniqueJobKeywords.includes(keyword)
  );
  
  // Calculate percentage of matching keywords (out of job keywords)
  const matchPercentage = Math.round(
    (matchingKeywords.length / uniqueJobKeywords.length) * 100
  );
  
  // Keyword matching is the primary factor (60% weight)
  score = Math.round(matchPercentage * 0.6);
  
  // 2. Boost score if job title contains skills found in resume (25% weight)
  const jobTitleLower = jobTitle.toLowerCase();
  const resumeSkillsInTitle = uniqueResumeKeywords.filter(skill => 
    jobTitleLower.includes(skill)
  );
  
  if (resumeSkillsInTitle.length > 0) {
    // More matching skills in title = higher boost (up to 25 points)
    const titleBoost = Math.min(25, resumeSkillsInTitle.length * 8);
    score += titleBoost;
  }
  
  // 3. Add base compatibility score (15% weight) 
  // Based on having any technical keywords at all
  if (matchingKeywords.length > 0) {
    const baseCompatibility = Math.min(15, matchingKeywords.length * 3);
    score += baseCompatibility;
  }
  
  // 4. Small bonus for having many resume keywords (shows experience depth)
  if (uniqueResumeKeywords.length >= 5) {
    score += 5; // Experience depth bonus
  }
  
  // Log the scoring breakdown for debugging
  console.log(`Scoring breakdown: Base match: ${Math.round(matchPercentage * 0.6)}, Title match: ${resumeSkillsInTitle.length > 0 ? Math.min(25, resumeSkillsInTitle.length * 8) : 0}, Keywords: ${matchingKeywords.length}/${uniqueJobKeywords.length}`);
  
  // Ensure score stays between 0-100
  return Math.min(100, Math.max(0, score));
}

/**
 * Submits an application to a job using the Playwright Worker API
 * @param user The user object
 * @param job The job listing to apply to
 * @returns Result of the application attempt: "success", "skipped", or "error"
 */
export async function submitApplication(user: any, job: JobListing): Promise<"success" | "skipped" | "error"> {
  try {
    console.log(`Attempting to submit application for ${job.jobTitle} at ${job.company} from source: ${job.source || 'unknown'}`);
    
    // Skip jobs without a source or apply URL
    if (!job.source || !job.applyUrl) {
      console.log("Missing source or apply URL, skipping application");
      return "skipped";
    }
    
    // For Workable jobs, validate the URL format
    if (job.source === 'workable') {
      if (!workableScraper.isValidWorkableApplicationUrl(job.applyUrl)) {
        console.log(`Invalid Workable application URL: ${job.applyUrl}`);
        return "skipped";
      }
      console.log(`Valid Workable application URL confirmed: ${job.applyUrl}`);
    }
    
    // Get the user's resume to send with the application
    let resume;
    try {
      resume = await storage.getResume(user.id);
    } catch (error) {
      console.error("Error fetching resume for job application:", error);
    }
    
    // Get user profile for additional application data
    let profile;
    try {
      profile = await storage.getUserProfile(user.id);
    } catch (error) {
      console.error("Error fetching user profile for job application:", error);
    }
    
    // Calculate match score if not already done
    let matchScore = job.matchScore || 70; // Default to 70 if no score available
    
    // For Workable jobs, use the schema-driven approach with introspection
    if (job.source === 'workable') {
      console.log("Using schema-driven approach for Workable job application");
      const { submitWorkableApplication } = await import('./workable-application.js');
      return await submitWorkableApplication(user, resume, profile, job, matchScore);
    }
    
    // For other job sources, use the original Playwright approach
    return await submitApplicationToPlaywright(user, resume, profile, job, matchScore);
  } catch (error) {
    console.error("Error submitting application:", error);
    return "error";
  }
}

/**
 * Submits a job application through the Playwright worker
 * @param user The user object
 * @param resume The user's resume (if available)
 * @param profile The user's profile (if available)
 * @param job The job listing
 * @param matchScore The calculated match score
 * @returns Result of the application attempt
 */
async function submitApplicationToPlaywright(
  user: any, 
  resume: any | undefined,
  profile: any | undefined,
  job: JobListing, 
  matchScore: number
): Promise<"success" | "skipped" | "error"> {
  // Check if we have a worker URL configured
  const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
  if (!workerUrl) {
    console.error("No Playwright worker URL configured");
    return "error";
  }
  
  try {
    console.log(`Sending application to Playwright worker for ${job.jobTitle} at ${job.company}`);
    
    // Prepare the payload to send to the Playwright worker
    const payload = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        resumeText: user.resumeText,
        // Include other relevant user fields that might be needed for the application
      },
      resume: resume ? {
        id: resume.id,
        filename: resume.filename,
        contentType: resume.contentType,
        fileContent: resume.fileContent, // Base64 encoded resume content if available
      } : null,
      profile: profile ? {
        id: profile.id,
        userId: profile.userId,
        jobTitle: profile.jobTitle,
        bio: profile.bio,
        skills: profile.skills,
        education: profile.education,
        workExperience: profile.workExperience,
        contactInfo: profile.contactInfo,
        jobPreferences: profile.jobPreferences,
        locationsOfInterest: profile.locationsOfInterest,
        jobTitlesOfInterest: profile.jobTitlesOfInterest,
        onlinePresence: profile.onlinePresence,
        preferredWorkArrangement: profile.preferredWorkArrangement
      } : null,
      job: {
        jobTitle: job.jobTitle,
        company: job.company,
        description: job.description,
        applyUrl: job.applyUrl,
        location: job.location,
        source: job.source,
        externalJobId: job.externalJobId,
      },
      matchScore
    };
    
    // Make sure the URL includes the protocol
    const completeWorkerUrl = workerUrl.startsWith('http') 
      ? workerUrl 
      : `https://${workerUrl}`;
    
    // Make the API request to the Playwright worker
    console.log(`POST ${completeWorkerUrl}/submit`);
    
    // Create a sanitized payload for logging
    const payloadForLogging = { ...payload };
    
    // Clean up resume data from logs
    if (payloadForLogging.resume && payloadForLogging.resume.fileContent) {
      payloadForLogging.resume = {
        ...payloadForLogging.resume,
        fileContent: `[BASE64 RESUME DATA (${payloadForLogging.resume.fileContent.length} chars) TRUNCATED]`
      };
    }
    
    // Clean up resume text from user object if it's large
    if (payloadForLogging.user && payloadForLogging.user.resumeText && 
        payloadForLogging.user.resumeText.length > 500) {
      payloadForLogging.user = {
        ...payloadForLogging.user,
        resumeText: `[RESUME TEXT TRUNCATED (${payloadForLogging.user.resumeText.length} chars)]`
      };
    }
    
    // Log sanitized payload for debugging
    console.log(`Payload prepared for ${job.company} - ${job.jobTitle}:`, 
                JSON.stringify(payloadForLogging, null, 2).substring(0, 1000) + 
                (JSON.stringify(payloadForLogging, null, 2).length > 1000 ? "... [truncated]" : ""));
    
    // Implement a more robust progression of timeouts
    const MAX_RETRIES = 4; // Increase max retries
    const TIMEOUT_PROGRESSION = [90000, 180000, 300000, 480000]; // 1.5, 3, 5, 8 minutes
    
    let retryCount = 0;
    let response = null;
    let lastError = null;
    
    while (retryCount <= MAX_RETRIES) {
      try {
        // Get the appropriate timeout for this attempt (use the last one if we're beyond the array)
        const timeoutMs = TIMEOUT_PROGRESSION[Math.min(retryCount, TIMEOUT_PROGRESSION.length - 1)];
        console.log(`Attempt ${retryCount + 1}/${MAX_RETRIES + 1} to submit application to Playwright worker (timeout: ${timeoutMs/1000}s)`);
        
        // Use AbortController to implement timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        
        response = await fetch(`${completeWorkerUrl}/submit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Add authentication if required
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        
        // Clear timeout if the request completes
        clearTimeout(timeoutId);
        
        // If we got here, the request was successful (no timeout)
        console.log(`✅ Attempt ${retryCount + 1} succeeded! Got response with status: ${response.status}`);
        break;
      } catch (error) {
        lastError = error;
        retryCount++;
        
        // Log the error but don't fail yet if we have retries left
        console.error(`Fetch attempt ${retryCount}/${MAX_RETRIES + 1} failed with error:`, error);
        
        // Check if we've used all retries
        if (retryCount > MAX_RETRIES) {
          console.error(`All ${MAX_RETRIES + 1} submission attempts failed, giving up.`);
          console.log("IMPORTANT: This may be a false negative - the application might have succeeded but the connection timed out");
          
          // When giving up, make a quick status check to see if the job was applied to
          try {
            console.log(`Making a final lightweight status check to verify if the application completed...`);
            const statusResponse = await fetch(`${completeWorkerUrl}/status`, {
              method: "GET",
            }).catch(e => null);
            
            if (statusResponse && statusResponse.ok) {
              const status = await statusResponse.json();
              console.log(`Status check result:`, status);
              
              // If the status shows the worker is idle, job might have completed successfully
              if (status && status.idle && status.lastJobSuccessful) {
                console.log(`⚠️ Status check indicates the worker is idle and last job was successful!`);
                console.log(`⚠️ Application might have actually succeeded despite the timeout failure`);
                
                // Return success to prevent marking the job as failed
                return "success";
              }
            }
          } catch (statusError) {
            console.error(`Status check failed:`, statusError);
          }
          
          // If we get here, we have no evidence that the job succeeded
          throw lastError;
        }
        
        // If the error is a timeout or other network error, retry
        if ((error as any).name === 'AbortError' || 
            (error as any).name === 'HeadersTimeoutError' || 
            (error as any).code === 'UND_ERR_HEADERS_TIMEOUT' ||
            (error as any).message?.includes('timeout')) {
          console.log(`Request timed out or network error, retrying in 5 seconds with a longer timeout...`);
          // Wait 5 seconds before retrying
          await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
          // For non-timeout errors, just re-throw
          throw error;
        }
      }
    }
    
    // Handle the response
    if (!response) {
      console.error("No response received from Playwright worker");
      return "error";
    }
    
    if (!response.ok) {
      let errorMessage = "";
      let detailedErrorInfo = "";
      let responseJson: any = null;
      
      try {
        // Try to parse JSON error response
        responseJson = await response.json();
        errorMessage = responseJson.message || "Unknown error";
        detailedErrorInfo = JSON.stringify(responseJson);
        console.error(`Error from Playwright worker (${response.status}): ${detailedErrorInfo}`);
        
        // Special case: If the worker returns a 400 status but with a "skipped" status in the JSON
        // This means it's intentionally skipping the job (e.g., not an Adzuna Easy Apply job)
        if (responseJson.status === "skipped") {
          console.log(`Job intentionally skipped by the worker: ${responseJson.message || "No reason provided"}`);
          return "skipped";
        }
      } catch (jsonError) {
        // If it's not JSON, try to get text
        try {
          const errorText = await response.text();
          errorMessage = errorText || "Unknown error";
          detailedErrorInfo = errorText;
          console.error(`Error from Playwright worker (${response.status}): ${errorText}`);
        } catch (textError) {
          errorMessage = "Unable to read error details";
          console.error(`Error from Playwright worker (${response.status}): Unable to read error details`);
        }
      }
      
      // If it's a 502 error from Railway (common for service errors), provide more context
      if (response.status === 502) {
        console.error(`Railway worker returned 502 Bad Gateway. The worker service may be overloaded, temporarily down, or experiencing issues.`);
        
        // If the job is reasonably matched, save it as a pending task for retry later
        if (matchScore >= 75) {
          return "skipped"; // Mark as skipped for now, can be retried later
        }
      }
      
      return "error";
    }
    
    // If we get here, the response was successful (200 OK)
    try {
      const result = await response.json();
      console.log("Playwright worker response:", result);
      
      if (result.status === "success") {
        console.log(`Application successfully submitted via Playwright worker`);
        return "success";
      } else if (result.status === "skipped") {
        console.log(`Application skipped by Playwright worker: ${result.error || "No reason provided"}`);
        return "skipped";
      } else {
        const errorDetails = result.error || result.message || "Unknown error";
        console.error(`Application failed: ${errorDetails}`);
        return "error";
      }
    } catch (parseError) {
      console.error("Error parsing successful response from Playwright worker:", parseError);
      return "error";
    }
  } catch (error) {
    console.error("Error calling Playwright worker:", error);
    return "error";
  }
}

/**
 * Adds a job to the user's job tracker
 * @param userId The user ID
 * @param job The job listing
 * @param score Optional match score (if already calculated)
 * @param status Optional job status (default: "Applied")
 * @param matchExplanation Optional match explanation text
 * @param applicationStatus Optional application processing status (default: "pending")
 * @returns The created job tracker record
 */
export async function addJobToTracker(
  userId: number, 
  job: JobListing, 
  score?: number, 
  status: string = "Applied",
  matchExplanation?: string,
  applicationStatus: string = "pending"
): Promise<any> {
  const now = new Date();
  
  // If no score or explanation is provided, we need to calculate them
  let matchScore = score;
  let explanation = matchExplanation;
  
  if (matchScore === undefined) {
    try {
      // Try to get AI matching data
      const jobMatchingService = await import("./job-matching-service.js");
      // Create a job object compatible with the job-matching-service
      const genericJob = {
        jobTitle: job.jobTitle,
        company: job.company,
        description: job.description,
        applyUrl: job.applyUrl,
        location: job.location,
        postedAt: job.postedAt,
        source: job.source,
        externalJobId: job.externalJobId
      };
      const matchResult = await jobMatchingService.scoreJobFit(userId, genericJob);
      
      matchScore = matchResult.matchScore;
      // Format match reasons as bullet points
      explanation = matchResult.reasons.map(reason => `• ${reason}`).join('\n');
    } catch (error) {
      console.error("Error getting AI match score and explanation:", error);
      // Fallback to just a score
      matchScore = await scoreJobFit({ id: userId } as any, job);
      explanation = "• Matching score calculated based on resume and job description\n• Upload a resume for better matching";
    }
  }
  
  // Create job data with all available fields
  const jobData: InsertJobTracker = {
    userId,
    jobTitle: job.jobTitle,
    company: job.company,
    link: job.applyUrl,
    status: status,
    applicationStatus: applicationStatus,
    notes: `Auto-applied via AIJobApply | Match Score: ${matchScore}/100${job.source ? ` | Source: ${job.source}` : ''}`,
    externalJobId: job.externalJobId,
    appliedAt: now,
    submittedAt: status === "Applied" ? now : undefined,
    matchScore: matchScore,
    matchExplanation: explanation, // Include the AI-generated match explanation
    source: job.source
  };
  
  const [result] = await db.insert(jobTracker).values(jobData as any).returning();
  return result;
}

/**
 * Creates a log entry for the auto-apply process
 */
export async function createAutoApplyLog(log: Omit<InsertAutoApplyLog, "timestamp">): Promise<void> {
  await db.insert(autoApplyLogs).values(log as any);
}

/**
 * Gets the auto-apply logs for a user
 */
export async function getAutoApplyLogs(userId: number): Promise<any[]> {
  return db
    .select()
    .from(autoApplyLogs)
    .where(eq(autoApplyLogs.userId, userId))
    .orderBy(sql`${autoApplyLogs.timestamp} DESC`);
}

/**
 * Gets the current auto-apply status for a user
 */
export async function getAutoApplyStatus(userId: number): Promise<any> {
  // Get the user record to check if auto-apply is enabled
  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error("User not found");
  }
  
  // Get the latest log entry
  const [latestLog] = await db
    .select()
    .from(autoApplyLogs)
    .where(eq(autoApplyLogs.userId, userId))
    .orderBy(sql`${autoApplyLogs.timestamp} DESC`)
    .limit(1);
  
  // Get the count of applied jobs today
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  
  const [appliedJobsCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(jobTracker)
    .where(
      and(
        eq(jobTracker.userId, userId),
        eq(jobTracker.status, "Applied"),
        gte(jobTracker.appliedAt!, today)
      )
    );
  
  // Get the total log count
  const [logCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(autoApplyLogs)
    .where(eq(autoApplyLogs.userId, userId));
  
  // Get the most recent logs
  const recentLogs = await db
    .select()
    .from(autoApplyLogs)
    .where(eq(autoApplyLogs.userId, userId))
    .orderBy(sql`${autoApplyLogs.timestamp} DESC`)
    .limit(10);
  
  // Get the subscription plans
  const { subscriptionPlans } = await import("@shared/schema.js");
  const userPlan = subscriptionPlans.find(plan => plan.id === (user?.subscriptionPlan || "FREE")) || subscriptionPlans[0];
  
  let currentStatus = latestLog?.status || "Not Started";
  
  // If the status is "Started", "Searching", or "Processing" but the flag is off, 
  // then override status to "Stopped" since the button was toggled off
  const activeStatuses = ['Started', 'Searching', 'Processing', 'Evaluating'];
  if (activeStatuses.includes(currentStatus) && !user.isAutoApplyEnabled) {
    currentStatus = "Stopped";
  }
  
  // TODO: Delete this whole block after verifying that the auto-apply worker is working
  // If the status is "Stopped", "Completed", "Error", or "Not Started" but the flag is on,
  // then override status to "Started" since the button was toggled on
  // const inactiveStatuses = ['Stopped', 'Completed', 'Error', 'Not Started', 'Failed'];
  // if (inactiveStatuses.includes(currentStatus) && user.isAutoApplyEnabled) {
  //   // This shouldn't happen often, but if it does, we need to restart the auto-apply process
  //   // This would happen if the server restarted unexpectedly while auto-apply was running
  //   // We'll restart auto-apply in this case
  //   startAutoApply(userId).catch(err => {
  //     console.error("Error restarting auto-apply process:", err);
  //   });
    
  //   currentStatus = "Started";
  // }
  
  return {
    currentStatus,
    isAutoApplyEnabled: user.isAutoApplyEnabled,
    latestMessage: latestLog?.message || "No auto-apply activity",
    appliedToday: appliedJobsCount?.count || 0,
    totalLimit: userPlan.dailyLimit,
    remaining: userPlan.dailyLimit - (appliedJobsCount?.count || 0),
    logs: recentLogs,
    hasMoreLogs: (logCount?.count || 0) > 10
  };
}