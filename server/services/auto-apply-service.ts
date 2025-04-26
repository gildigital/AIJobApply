import { db } from "../db";
import { jobTracker, autoApplyLogs, users, InsertJobTracker, InsertAutoApplyLog } from "@shared/schema";
import { eq, and, gte, sql, or } from "drizzle-orm";
import { storage } from "../storage";

/**
 * Import the Workable job functions
 */
import { getWorkableJobsForUser, workableScraper } from "./workable-scraper";

/**
 * Represents a job listing from an external source
 */
export interface JobListing {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  location?: string;
  postedAt?: string;
  source?: string;
  externalJobId?: string; // Unique identifier from the source
  matchScore?: number;    // Score indicating how well the job matches the user's profile
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
    const { checkSubscriptionAccess } = await import("../utils/subscription-utils");
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
    const { getRemainingApplications } = await import("../utils/subscription-utils");
    const remainingApplications = await getRemainingApplications(userId);
    
    if (remainingApplications <= 0) {
      await createAutoApplyLog({
        userId,
        status: "Failed",
        message: "Daily application limit reached"
      });
      return "Daily application limit reached";
    }

    // Process asynchronously (in a real app, this would be a background worker)
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
      // Stop if we've reached the limit
      if (applicationsSubmitted >= maxApplications) {
        await createAutoApplyLog({
          userId,
          status: "Completed",
          message: `Daily limit of ${maxApplications} applications reached`
        });
        return;
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

      // Score the job fit
      const score = await scoreJobFit(user, job);
      
      // Log the evaluation
      await createAutoApplyLog({
        userId,
        status: "Evaluating",
        message: `Evaluating match for ${job.company} - ${job.jobTitle} (Score: ${score})`
      });

      // Get user's preferred match score threshold or use default
      const profile = await storage.getUserProfile(userId);
      const matchScoreThreshold = profile?.matchScoreThreshold || 70;
      
      // Only apply if the score meets or exceeds the threshold
      if (score >= matchScoreThreshold) {
        try {
          // Submit the application based on job source
          const result = await submitApplication(user, job);
          
          // Create job tracker entry with appropriate application status
          let status = "Applied";
          let applicationStatus = "pending";
          let message = `Evaluating application to ${job.company} - ${job.jobTitle}`;
          
          // Handle different submission results
          switch (result) {
            case "success":
              status = "Applied";
              applicationStatus = "applied";
              message = `Successfully applied to ${job.company} - ${job.jobTitle}`;
              applicationsSubmitted++;
              break;
            case "skipped":
              status = "Saved";
              applicationStatus = "skipped";
              message = `Skipped ${job.company} - ${job.jobTitle} due to unsupported application process`;
              break;
            case "error":
              status = "Failed";
              applicationStatus = "failed";
              message = `Failed to apply to ${job.company} - ${job.jobTitle}`;
              break;
          }
          
          // Add to job tracker with the match score and application status
          const jobRecord = await addJobToTracker(
            userId, 
            job, 
            score, 
            status,
            undefined, // Let the AI scoring handle match explanation
            applicationStatus // Pass the application status
          );
          
          // Log the application attempt
          await createAutoApplyLog({
            userId,
            jobId: jobRecord.id,
            status: result === "success" ? "Applied" : (result === "skipped" ? "Skipped" : "Failed"),
            message
          });
          
          // Add a small delay between applications to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error: any) {
          // Even if the application fails, we should still track the job with its match score
          // This ensures we can see the match score for failed applications
          try {
            const jobRecord = await addJobToTracker(
              userId, 
              job, 
              score, 
              "Error", 
              undefined, 
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
          score, 
          "Skipped", 
          undefined, 
          "skipped"
        );
        
        await createAutoApplyLog({
          userId,
          jobId: jobRecord.id,
          status: "Skipped",
          message: `Skipped job at ${job.company} - ${job.jobTitle} (Score: ${score}, Threshold: ${matchScoreThreshold})`
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
 * Gets job listings that match a user's profile
 * Uses external APIs to get real job listings
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
    
    // Get Workable jobs for the user
    console.log(`Searching for Workable jobs for user ${userId}...`);
    const workableJobs = await getWorkableJobsForUser(userId);
    console.log(`Found ${workableJobs.length} jobs from Workable`);
    
    if (workableJobs.length === 0) {
      console.log("No Workable jobs found for the user's criteria");
      return [];
    }
    
    // Filter out excluded companies if specified
    if (profile?.excludedCompanies && profile.excludedCompanies.length > 0) {
      const excludedCompanies = profile.excludedCompanies.map(c => c.toLowerCase());
      
      const filteredJobs = workableJobs.filter(job => {
        // If company name is in the excluded list, filter it out
        const companyName = job.company?.toLowerCase() || '';
        return !excludedCompanies.some(excluded => companyName.includes(excluded));
      });
      
      console.log(`Filtered out ${workableJobs.length - filteredJobs.length} jobs from excluded companies`);
      return filteredJobs;
    }
    
    // Return Workable jobs
    return workableJobs;
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
    // Get the user's resume content
    const resume = await storage.getResume(user.id);
    if (!resume || !resume.parsedText) {
      // Without resume data, we return a default score
      return 50;
    }

    // Extract keywords from both resume and job description
    const resumeKeywords = extractKeywords(resume.parsedText);
    const jobKeywords = extractKeywords(job.description);
    
    // Calculate the match score
    return calculateMatchScore(resumeKeywords, jobKeywords, job.description, job.jobTitle);
  } catch (error) {
    console.error("Error calculating job match score:", error);
    
    // Fallback to a default score if scoring fails
    const baseScore = 70; // Start with a decent chance of matching
    const randomVariation = Math.floor(Math.random() * 20); // +/- up to 20 points
    
    // Add the variation (can be positive or negative)
    const finalScore = Math.min(100, Math.max(0, baseScore + randomVariation - 10));
    
    return finalScore;
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
  // Base factors for scoring
  let score = 50; // Start with a neutral score
  
  // 1. Calculate keyword match percentage
  const uniqueJobKeywords = Array.from(new Set(jobKeywords));
  const uniqueResumeKeywords = Array.from(new Set(resumeKeywords));
  
  // If we have 0 keywords, return a moderate score
  if (uniqueJobKeywords.length === 0) {
    return 65; // Default score when we can't extract keywords
  }
  
  // Count keywords that match between resume and job
  const matchingKeywords = uniqueResumeKeywords.filter(keyword => 
    uniqueJobKeywords.includes(keyword)
  );
  
  // Calculate percentage of matching keywords (out of job keywords)
  const matchPercentage = Math.round(
    (matchingKeywords.length / uniqueJobKeywords.length) * 100
  );
  
  // 2. Adjust score based on keyword match percentage (40% weight)
  score = Math.round(matchPercentage * 0.4);
  
  // 3. Boost score if job title contains skills found in resume (30% weight)
  const jobTitleLower = jobTitle.toLowerCase();
  const resumeSkillsInTitle = uniqueResumeKeywords.filter(skill => 
    jobTitleLower.includes(skill)
  );
  
  if (resumeSkillsInTitle.length > 0) {
    // More matching skills in title = higher boost
    const titleBoost = Math.min(30, resumeSkillsInTitle.length * 10);
    score += titleBoost;
  }
  
  // 4. Add some variance for jobs with similar scores (10% weight)
  const variance = Math.floor(Math.random() * 10);
  score += variance;
  
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
      // Import and use the URL validator from Workable scraper
      const { workableScraper } = await import('./workable-scraper');
      
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
      const { submitWorkableApplication } = await import('./workable-application');
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
  const workerUrl = process.env.PLAYWRIGHT_WORKER_URL;
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
    const response = await fetch(`${completeWorkerUrl}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Add authentication if required
      },
      body: JSON.stringify(payload)
    });
    
    // Handle the response
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
      const jobMatchingService = await import("./job-matching-service");
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
  
  const [result] = await db.insert(jobTracker).values(jobData).returning();
  return result;
}

/**
 * Creates a log entry for the auto-apply process
 */
export async function createAutoApplyLog(log: Omit<InsertAutoApplyLog, "timestamp">): Promise<void> {
  await db.insert(autoApplyLogs).values(log);
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
  today.setHours(0, 0, 0, 0);
  
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
  const { subscriptionPlans } = await import("@shared/schema");
  const userPlan = subscriptionPlans.find(plan => plan.id === (user?.subscriptionPlan || "FREE")) || subscriptionPlans[0];
  
  let currentStatus = latestLog?.status || "Not Started";
  
  // If the status is "Started", "Searching", or "Processing" but the flag is off, 
  // then override status to "Stopped" since the button was toggled off
  const activeStatuses = ['Started', 'Searching', 'Processing', 'Evaluating'];
  if (activeStatuses.includes(currentStatus) && !user.isAutoApplyEnabled) {
    currentStatus = "Stopped";
  }
  
  // If the status is "Stopped", "Completed", "Error", or "Not Started" but the flag is on,
  // then override status to "Started" since the button was toggled on
  const inactiveStatuses = ['Stopped', 'Completed', 'Error', 'Not Started', 'Failed'];
  if (inactiveStatuses.includes(currentStatus) && user.isAutoApplyEnabled) {
    // This shouldn't happen often, but if it does, we need to restart the auto-apply process
    // This would happen if the server restarted unexpectedly while auto-apply was running
    // We'll restart auto-apply in this case
    startAutoApply(userId).catch(err => {
      console.error("Error restarting auto-apply process:", err);
    });
    
    currentStatus = "Started";
  }
  
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