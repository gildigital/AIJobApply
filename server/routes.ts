import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage.js";
import { setupAuth } from "./auth.js";
import multer from "multer";
import { z } from "zod";
import { insertApplicationAnswerSchema, insertJobTrackerSchema, requiredQuestionsSchema, demographicQuestionsSchema, subscriptionPlans, type User } from "@shared/schema.js";
import { extractTextFromPDFBase64 } from "./utils/pdf-parser.js";
import { generateUserSummary } from "./utils/user-summary-generator.js";
import Stripe from "stripe";

import {
  startAutoApply,
  getAutoApplyStatus,
  getAutoApplyLogs,
  createAutoApplyLog,
  JobListing
} from "./services/auto-apply-service.js";
import {
  enqueueJobsForUser,
  getAutoApplyStatus as getWorkerStatus,
  startAutoApplyWorker,
  stopAutoApplyWorker,
  ensureWorkerIsRunning,
  getWorkerStatus as getWorkerHealthStatus
} from "./services/auto-apply-worker.js";
import { getWorkableJobsForUser, workableScraper } from "./services/workable-scraper.js";
import { registerProfileRoutes } from "./routes/profile-routes.js";
import { registerTestDataRoutes } from "./routes/test-data-routes.js";
import { registerWorkableTestRoutes } from "./routes/workable-test-routes.js";
import { registerWorkableSchemaRoutes } from "./routes/workable-schema-routes.js";
import { registerPlaywrightTestRoutes } from "./routes/playwright-test-routes.js";
import { registerEnvTestRoutes } from "./routes/env-test-routes.js";
import { registerDirectFetchTestRoutes } from "./routes/direct-fetch-test-routes.js";
import { registerWorkableDirectFetch } from "./routes/workable-direct-fetch.js";
import { registerMigrationRoutes } from "./routes/migration-routes.js";
import {
  testAdzunaSearch,
  testIntegratedJobSearch,
  testAutoApplyWithAdzuna,
  testAdzunaHealth
} from "./routes/adzuna-test-routes.js";
import { 
  attachPlanInfo, 
  requireAIAccess, 
  requirePremiumFeature, 
  addModelInfo,
  handlePlanErrors 
} from "./utils/plan-middleware.js";

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Stripe
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY environment variable');
  }
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

  // Setup authentication routes
  setupAuth(app);

  // 🎫 PLAN-BASED ACCESS CONTROL MIDDLEWARE
  // Attach plan information to all authenticated requests
  app.use(attachPlanInfo);
  app.use(addModelInfo);

  // Setup profile management routes
  registerProfileRoutes(app);

  // Setup test data routes (only in development)
  registerTestDataRoutes(app);

  // Setup Workable test routes
  registerWorkableTestRoutes(app);

  // Setup Workable schema-driven routes
  registerWorkableSchemaRoutes(app);

  // Setup Playwright test routes
  registerPlaywrightTestRoutes(app);

  // Setup environment test routes
  registerEnvTestRoutes(app);

  // Setup direct fetch test routes
  registerDirectFetchTestRoutes(app);

  // Setup Workable direct fetch routes
  registerWorkableDirectFetch(app);

  // Setup database migration routes
  registerMigrationRoutes(app);

  // Setup Adzuna test routes
  app.get("/api/test/adzuna/search", testAdzunaSearch);
  app.get("/api/test/adzuna/integrated", testIntegratedJobSearch);
  app.post("/api/test/adzuna/auto-apply", testAutoApplyWithAdzuna);
  app.get("/api/test/adzuna/health", testAdzunaHealth);

  // Application answers API
  app.get("/api/application-answers", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const answers = await storage.getApplicationAnswers(req.user.id);
      res.json(answers);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch application answers" });
    }
  });

  app.post("/api/application-answers", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const answerData = insertApplicationAnswerSchema.parse({
        ...req.body,
        userId: req.user.id,
      });

      const answer = await storage.createApplicationAnswer(answerData);
      res.status(201).json(answer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create application answer" });
    }
  });

  // Batch required questions API
  app.post("/api/onboarding/required-questions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const questions = requiredQuestionsSchema.parse(req.body);
      const answers = [];

      // Convert the questions to application answers
      const mappings = [
        { field: 'workAuthorization', question: 'Are you authorized to work in the U.S.?', type: 'radio' },
        { field: 'timezone', question: 'What time zone are you located in?', type: 'select' },
        { field: 'education', question: 'What\'s your highest education level?', type: 'select' },
        { field: 'experience', question: 'How many years of experience do you have?', type: 'select' },
        { field: 'jobTitle', question: 'Last job title', type: 'text' },
        { field: 'company', question: 'Last company', type: 'text' },
        { field: 'relocation', question: 'Are you open to relocation?', type: 'radio' },
        { field: 'workType', question: 'Preferred work type', type: 'select' },
        { field: 'sponsorship', question: 'Do you, or will you require sponsorship in the future?', type: 'radio' },
      ];

      for (const mapping of mappings) {
        const answer = await storage.createApplicationAnswer({
          userId: req.user.id,
          questionText: mapping.question,
          answer: questions[mapping.field as keyof typeof questions].toString(),
          category: 'required',
          isOptional: false,
          type: mapping.type,
        });
        answers.push(answer);
      }

      res.status(201).json(answers);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to save required questions" });
    }
  });

  // Batch demographic questions API
  app.post("/api/onboarding/demographic-questions", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const questions = demographicQuestionsSchema.parse(req.body);
      const answers = [];

      // Convert the questions to application answers
      const mappings = [
        { field: 'gender', question: 'How do you describe your gender identity?', type: 'checkbox', optional: true },
        { field: 'veteranStatus', question: 'Protected Veteran Status', type: 'select', optional: true },
        { field: 'race', question: 'How would you describe your racial/ethnic background?', type: 'checkbox', optional: true },
        { field: 'sexualOrientation', question: 'How would you describe your sexual orientation?', type: 'checkbox', optional: true },
        { field: 'transgender', question: 'Do you identify as transgender?', type: 'radio', optional: true },
        { field: 'disability', question: 'Do you have a disability or chronic condition?', type: 'radio', optional: true },
      ];

      for (const mapping of mappings) {
        const value = questions[mapping.field as keyof typeof questions];
        if (value !== undefined && (Array.isArray(value) ? value.length > 0 : value)) {
          const answer = await storage.createApplicationAnswer({
            userId: req.user.id,
            questionText: mapping.question,
            answer: Array.isArray(value) ? value.join(', ') : value.toString(),
            category: 'demographic',
            isOptional: mapping.optional,
            type: mapping.type,
          });
          answers.push(answer);
        }
      }

      // If "gender" is "self_describe", add the self-description
      if (questions.gender?.includes('self_describe') && questions.genderSelfDescribe) {
        const answer = await storage.createApplicationAnswer({
          userId: req.user.id,
          questionText: 'Gender self-description',
          answer: questions.genderSelfDescribe,
          category: 'demographic',
          isOptional: true,
          type: 'text',
        });
        answers.push(answer);
      }

      res.status(201).json(answers);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to save demographic questions" });
    }
  });

  // Resume upload API
  app.post("/api/resume", upload.single('resume'), async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    try {
      // Convert file to base64 for storage
      const fileData = req.file.buffer.toString('base64');
      const filename = req.file.originalname;

      // Extract text from the PDF
      // console.log("[Resume Upload] Starting PDF text extraction...");
      const resumeText = await extractTextFromPDFBase64(fileData);
      // console.log("[Resume Upload] Extracted text length:", resumeText?.length || 0, "characters");

      // Generate a user summary from the resume text
      const userSummary = await generateUserSummary(resumeText);

      // Update the user with the extracted text and summary
      await storage.updateUser(req.user.id, {
        resumeText,
        userSummary
      });

      // Create/update the resume record
      const resume = await storage.createResume({
        userId: req.user.id,
        filename,
        fileData,
        parsedText: resumeText, // Add the parsed text to the resume record
        uploadedAt: new Date(),
      });

      // Don't send the full file data back to client
      const { fileData: _, ...resumeWithoutData } = resume;

      res.status(201).json({
        ...resumeWithoutData,
        resumeText,
        userSummary
      });
    } catch (error) {
      console.error('Resume upload error:', error);
      res.status(500).json({ message: "Failed to upload resume" });
    }
  });

  app.get("/api/resume", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const resume = await storage.getResume(req.user.id);
      if (!resume) {
        return res.status(404).json({ message: "No resume found" });
      }

      // Get the user to include resumeText and userSummary
      const user = await storage.getUser(req.user.id);

      // Don't send the full file data back to client
      const { fileData: _, ...resumeWithoutData } = resume;

      res.json({
        ...resumeWithoutData,
        resumeText: user?.resumeText,
        userSummary: user?.userSummary
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch resume" });
    }
  });

  app.get("/api/resume/download", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const resume = await storage.getResume(req.user.id);
      if (!resume) {
        return res.status(404).json({ message: "No resume found" });
      }

      const buffer = Buffer.from(resume.fileData, 'base64');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${resume.filename}"`);
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ message: "Failed to download resume" });
    }
  });

  // Job tracker API
  app.get("/api/jobs", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      // Check for pagination parameters
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        return res.status(400).json({
          message: "Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100."
        });
      }

      // If pagination parameters are provided, use paginated query
      if (req.query.page || req.query.limit) {
        const result = await storage.getJobsPaginated(req.user.id, page, limit);
        const totalPages = Math.ceil(result.total / limit);

        res.json({
          jobs: result.jobs,
          total: result.total,
          page,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        });
      } else {
        // Backward compatibility: return all jobs if no pagination params
        const jobs = await storage.getJobs(req.user.id);
        res.json(jobs);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ message: "Failed to fetch jobs" });
    }
  });

  app.post("/api/jobs", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const jobData = insertJobTrackerSchema.parse({
        ...req.body,
        userId: req.user.id,
      });

      const job = await storage.createJob(jobData);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create job" });
    }
  });

  app.put("/api/jobs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }

      const existingJob = await storage.getJob(jobId);
      if (!existingJob) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (existingJob.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to update this job" });
      }

      // Extract only the fields that are allowed to be updated
      const { jobTitle, company, link, status, notes } = req.body;

      const updateData: Partial<typeof existingJob> = {};
      if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
      if (company !== undefined) updateData.company = company;
      if (link !== undefined) updateData.link = link;
      if (status !== undefined) updateData.status = status;
      if (notes !== undefined) updateData.notes = notes;

      const updatedJob = await storage.updateJob(jobId, updateData);
      res.json(updatedJob);
    } catch (error) {
      console.error("Error updating job:", error);
      // Return more detailed error
      res.status(500).json({
        message: "Failed to update job",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.delete("/api/jobs/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }

      const existingJob = await storage.getJob(jobId);
      if (!existingJob) {
        return res.status(404).json({ message: "Job not found" });
      }

      if (existingJob.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to delete this job" });
      }

      await storage.deleteJob(jobId);
      res.status(200).json({ message: "Job deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete job" });
    }
  });

  // Resubmit a failed application
  app.post("/api/jobs/:id/resubmit", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }

      // Get the job
      const job = await storage.getJob(jobId);
      if (!job) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Check if it belongs to the authenticated user
      if (job.userId !== req.user.id) {
        return res.status(403).json({ message: "You don't have permission to resubmit this job" });
      }

      // Check if the job is in a state that can be resubmitted
      if (job.applicationStatus !== "failed" && job.status !== "Failed" && job.status !== "Error") {
        return res.status(400).json({
          message: "Only failed applications can be resubmitted",
          currentStatus: job.applicationStatus || job.status
        });
      }

      // Get the user's subscription access
      const { checkSubscriptionAccess } = await import("./utils/subscription-utils.js");
      const access = await checkSubscriptionAccess(req.user.id);

      if (!access.allowed) {
        return res.status(403).json({ message: access.reason || "Subscription limit reached" });
      }

      // Create job listing object from job tracker entry
      const jobListing: JobListing = {
        jobTitle: job.jobTitle,
        company: job.company,
        description: job.notes || "", // We don't store the full description in the job tracker
        applyUrl: job.link || "",
        location: "", // Job tracker doesn't store location
        source: job.source || "manual", // Default to manual if not available
        externalJobId: job.externalJobId || `manual-${job.id}` // Create unique ID if not available
      };

      // Import the auto-apply service
      const { submitApplication } = await import("./services/auto-apply-service.js");

      // Attempt to resubmit the application
      const result = await submitApplication(req.user, jobListing);

      // Update the job status based on the result
      let newStatus, newApplicationStatus, message;

      switch (result) {
        case "success":
          newStatus = "Applied";
          newApplicationStatus = "applied";
          message = "Application successfully resubmitted";
          break;
        case "skipped":
          newStatus = "Saved";
          newApplicationStatus = "skipped";
          message = "Application skipped due to unsupported process";
          break;
        case "error":
          newStatus = "Failed";
          newApplicationStatus = "failed";
          message = "Application resubmission failed";
          break;
      }

      // Update the job with the new status
      const updatedJob = await storage.updateJob(jobId, {
        status: newStatus,
        applicationStatus: newApplicationStatus,
        submittedAt: result === "success" ? new Date() : undefined,
        updatedAt: new Date()
      });

      // Log the resubmission - keep only "Applied" status
      const { createAutoApplyLog } = await import("./services/auto-apply-service.js");
      if (result === "success") {
        await createAutoApplyLog({
          userId: req.user.id,
          jobId: jobId,
          status: "Applied",
          message: `Manually resubmitted application to ${job.company} - ${job.jobTitle}: ${message}`
        });
      } else {
        // TODO: Track statistics for non-Applied status instead of logging to auto_apply_logs table
        // await createAutoApplyLog({
        //   userId: req.user.id,
        //   jobId: jobId,
        //   status: result === "skipped" ? "Skipped" : "Failed",
        //   message: `Manually resubmitted application to ${job.company} - ${job.jobTitle}: ${message}`
        // });
      }

      res.json({
        message,
        status: newStatus,
        applicationStatus: newApplicationStatus,
        job: updatedJob
      });
    } catch (error) {
      console.error("Error resubmitting application:", error);
      res.status(500).json({
        message: "Failed to resubmit application",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get user summary
  app.get("/api/user-summary", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        resumeText: user.resumeText || "",
        userSummary: user.userSummary || ""
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user summary" });
    }
  });

  // Subscription access check endpoint for auto-apply functionality
  app.get("/api/check-subscription-access", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { checkSubscriptionAccess, getRemainingApplications } = await import("./utils/subscription-utils.js");
      const result = await checkSubscriptionAccess(req.user.id);

      // If allowed, include remaining applications
      let remainingApplications = 0;
      if (result.allowed) {
        remainingApplications = await getRemainingApplications(req.user.id);
      }

      return res.status(200).json({
        ...result,
        remainingApplications,
        plan: req.user.subscriptionPlan || "FREE"
      });
    } catch (error: any) {
      console.error("Error checking subscription access:", error);
      return res.status(500).json({
        allowed: false,
        reason: "Error checking subscription status",
        error: error.message
      });
    }
  });

  // Auto-apply endpoints

  // Start auto-apply process
  app.post("/api/auto-apply/start", requireAIAccess, async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      // Only update the user flag - the worker will pick this up automatically
      await storage.updateUser(req.user.id, { isAutoApplyEnabled: true });

      // TODO: Track statistics for "Started" status instead of logging to auto_apply_logs table
      // await createAutoApplyLog({
      //   userId: req.user.id,
      //   status: "Started",
      //   message: "Auto-apply enabled - background worker will process jobs automatically"
      // });

      res.status(200).json({
        message: "Auto-apply enabled successfully. The background worker will find and apply to jobs automatically."
      });
    } catch (error: any) {
      console.error("Error enabling auto-apply:", error);
      res.status(500).json({
        error: "Failed to enable auto-apply",
        message: error.message
      });
    }
  });

  // Stop auto-apply process
  app.post("/api/auto-apply/stop", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      // Update the user flag first
      await storage.updateUser(req.user.id, { isAutoApplyEnabled: false });

      // TODO: Track statistics for "Stopped" status instead of logging to auto_apply_logs table
      // await createAutoApplyLog({
      //   userId: req.user.id,
      //   status: "Stopped",
      //   message: "Auto-apply process manually stopped by user"
      // });

      res.status(200).json({ message: "Auto-apply process stopped" });
    } catch (error: any) {
      console.error("Error stopping auto-apply:", error);
      res.status(500).json({
        error: "Failed to stop auto-apply process",
        message: error.message
      });
    }
  });

  // Get auto-apply status
  app.get("/api/auto-apply/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const status = await getAutoApplyStatus(req.user.id);
      res.status(200).json(status);
    } catch (error: any) {
      console.error("Error getting auto-apply status:", error);
      res.status(500).json({
        error: "Failed to get auto-apply status",
        message: error.message
      });
    }
  });

  // Get auto-apply logs
  app.get("/api/auto-apply/logs", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const logs = await getAutoApplyLogs(req.user.id);
      res.status(200).json(logs);
    } catch (error: any) {
      console.error("Error getting auto-apply logs:", error);
      res.status(500).json({
        error: "Failed to get auto-apply logs",
        message: error.message
      });
    }
  });

  // Find jobs for auto-apply (manually triggered job search)
  // Add search progress tracking
  let jobSearchProgress: {
    current: number;
    total: number;
    percentage: number;
    status: string;
    jobs: JobListing[];
  } = {
    current: 0,
    total: 9,
    percentage: 0,
    status: "Initializing search...",
    jobs: []
  };

  app.get("/api/auto-apply/search-progress", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    res.json({
      progress: {
        current: jobSearchProgress.current,
        total: jobSearchProgress.total,
        percentage: jobSearchProgress.percentage,
        status: jobSearchProgress.status
      },
      jobs: jobSearchProgress.jobs.slice(0, 10) // Only send the first 10 jobs for performance
    });
  });

  app.post("/api/auto-apply/find-jobs", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { userId, continueToken, pageSize = 10, maxInitialJobs = 15, workplace, remote } = req.body;

      // Only allow users to search for their own jobs
      if (userId && userId !== req.user.id) {
        return res.status(403).json({
          message: "You can only search for your own jobs",
          success: false
        });
      }

      const userIdToUse = userId || req.user.id;

      // Reset progress if starting a new search
      if (!continueToken) {
        jobSearchProgress = {
          current: 0,
          total: 9,
          percentage: 0,
          status: "Starting search...",
          jobs: [] as JobListing[]
        };
      }

      // Setup progress callback
      const updateProgress = (progress: { current: number, total: number, status: string, jobs?: JobListing[], percentage?: number }) => {
        jobSearchProgress = {
          ...jobSearchProgress,
          ...progress,
          // Calculate percentage (0-100) if not provided
          percentage: progress.percentage || Math.round((progress.current / progress.total) * 100),
          // Keep track of any jobs found in the progress
          jobs: progress.jobs ?
            [...jobSearchProgress.jobs, ...(progress.jobs || [])] :
            jobSearchProgress.jobs
        };
      };

      // For jobs-so-far in the UI
      jobSearchProgress.status = continueToken ?
        "Loading more results..." :
        "Searching for matching jobs...";

      // Get jobs from Workable based on user profile
      // console.log(`Finding jobs for user ${userIdToUse}...`);

      // Extract useScrolling parameter from request body (default to undefined to use the global feature flag)
      const { useScrolling } = req.body;

      // Import the integrated scraper that supports both pagination and infinite scrolling
      const { getWorkableJobsForUser } = await import('./services/workable-scroll-integration.js');

      // Call the integrated getWorkableJobsForUser function which can use either implementation 
      const jobListings = await getWorkableJobsForUser(
        userIdToUse,
        {
          useScrollingScraper: useScrolling, // Use either the original pagination-based or new scroll-based implementation
          maxJobs: continueToken ? 1000 : 1000, // Increased limit to get all available jobs (was 100/50)
          maxSearchUrls: continueToken ? 20 : 10, // Increased search URLs as well (was 10/5)
          preferredWorkplace: workplace as 'remote' | 'hybrid' | 'any' // Pass workplace preference
        }
      );

      // Create job result structure similar to original pagination-based scraper
      const jobResult = {
        jobs: jobListings,
        hasMore: jobListings.length > 0, // Simplified hasMore logic
        continueToken: jobListings.length > 0 ? 'next-page' : undefined
      };

      const { jobs, hasMore, continueToken: newContinueToken } = jobResult;
      // console.log(`Found ${jobs.length} jobs from Workable, hasMore: ${hasMore}`);

      // Return the jobs with appropriate message
      const successMessage = jobs.length > 0
        ? `Found ${jobs.length} jobs matching your profile${hasMore ? ' (more available)' : ''}`
        : "No jobs found matching your profile criteria";

      res.json({
        success: true,
        jobs,
        hasMore,
        continueToken: newContinueToken,
        message: successMessage
      });
    } catch (error: any) {
      console.error("Error finding jobs:", error);
      res.status(500).json({
        error: "Failed to find jobs",
        message: error.message,
        success: false
      });
    }
  });

  // Job Queue API endpoints

  // Enqueue jobs for auto-apply
  app.post("/api/job-queue/enqueue", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { jobIds } = req.body;

      if (!Array.isArray(jobIds) || jobIds.length === 0) {
        return res.status(400).json({
          message: "jobIds must be a non-empty array of job IDs",
          success: false
        });
      }

      // Validate that these jobs belong to the user
      for (const jobId of jobIds) {
        const job = await storage.getJob(jobId);
        if (!job || job.userId !== req.user.id) {
          return res.status(403).json({
            message: `You don't have permission to enqueue job ${jobId}`,
            success: false
          });
        }
      }

      // Get worker status to check daily limits
      const status = await getWorkerStatus(req.user.id);

      if (status.appliedToday >= status.dailyLimit) {
        return res.status(400).json({
          message: `Daily application limit of ${status.dailyLimit} reached`,
          success: false,
          status
        });
      }

      // Calculate how many more jobs the user can enqueue
      const remainingSlots = status.dailyLimit - status.appliedToday - status.queuedJobs;
      const jobsToEnqueue = remainingSlots <= 0 ? [] :
        jobIds.slice(0, Math.min(jobIds.length, remainingSlots));

      if (jobsToEnqueue.length === 0) {
        return res.status(400).json({
          message: "Queue is full or daily limit reached",
          success: false,
          status,
          remainingSlots
        });
      }

      // Enqueue the jobs
      const queuedJobs = await enqueueJobsForUser(req.user.id, jobsToEnqueue);

      res.json({
        message: `Successfully enqueued ${queuedJobs.length} jobs`,
        success: true,
        queuedJobs,
        remainingSlots: remainingSlots - queuedJobs.length
      });
    } catch (error: any) {
      console.error("Error enqueuing jobs:", error);
      res.status(500).json({
        message: error.message || "Failed to enqueue jobs",
        success: false
      });
    }
  });

  // Get queue status
  app.get("/api/job-queue/status", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const status = await getWorkerStatus(req.user.id);
      const queuedJobs = await storage.getQueuedJobsForUser(req.user.id);

      // Get job details for each queued job
      const queuedJobDetails = await Promise.all(
        queuedJobs.map(async (queueItem) => {
          const job = await storage.getJob(queueItem.jobId);
          return {
            queueId: queueItem.id,
            queueStatus: queueItem.status,
            priority: queueItem.priority,
            error: queueItem.error,
            createdAt: queueItem.createdAt,
            processedAt: queueItem.processedAt,
            job: job || { id: queueItem.jobId, jobTitle: "Unknown Job", company: "Unknown" }
          };
        })
      );

      res.json({
        status,
        queuedJobDetails,
        success: true
      });
    } catch (error: any) {
      console.error("Error getting queue status:", error);
      res.status(500).json({
        message: error.message || "Failed to get queue status",
        success: false
      });
    }
  });

  // Start worker (admin endpoint)
  app.post("/api/job-queue/worker/start", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // For production, you'd want more strict admin checks here

    try {
      startAutoApplyWorker();
      res.json({
        message: "Worker started successfully",
        success: true,
        workerStatus: getWorkerHealthStatus()
      });
    } catch (error: any) {
      console.error("Error starting worker:", error);
      res.status(500).json({
        message: error.message || "Failed to start worker",
        success: false
      });
    }
  });

  // Stop worker (admin endpoint)
  app.post("/api/job-queue/worker/stop", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // For production, you'd want more strict admin checks here

    try {
      stopAutoApplyWorker();
      res.json({
        message: "Worker stopped successfully",
        success: true,
        workerStatus: getWorkerHealthStatus()
      });
    } catch (error: any) {
      console.error("Error stopping worker:", error);
      res.status(500).json({
        message: error.message || "Failed to stop worker",
        success: false
      });
    }
  });

  // Get worker health status (admin endpoint)
  app.get("/api/job-queue/worker/health", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const healthStatus = getWorkerHealthStatus();
      res.json({
        message: "Worker health status retrieved",
        success: true,
        ...healthStatus
      });
    } catch (error: any) {
      console.error("Error getting worker health:", error);
      res.status(500).json({
        message: error.message || "Failed to get worker health",
        success: false
      });
    }
  });

  // Ensure worker is running (admin endpoint)
  app.post("/api/job-queue/worker/ensure", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const wasHealthy = ensureWorkerIsRunning();
      const healthStatus = getWorkerHealthStatus();

      res.json({
        message: wasHealthy ? "Worker is healthy and running" : "Worker was restarted or started",
        success: true,
        wasHealthy,
        workerStatus: healthStatus
      });
    } catch (error: any) {
      console.error("Error ensuring worker is running:", error);
      res.status(500).json({
        message: error.message || "Failed to ensure worker is running",
        success: false
      });
    }
  });

  // ✨ NEW: Callback endpoint for Playwright worker to update job status
  app.post("/api/worker/update-job-status", async (req, res) => {
    try {
      const { queueId, jobId, userId, finalStatus, message } = req.body;

      // Verify shared secret for security (check header first, then body as fallback)
      const expectedSecret = process.env.WORKER_SHARED_SECRET;
      const providedSecret = req.headers['x-worker-secret'] || req.body.secret;
      
      if (!expectedSecret || providedSecret !== expectedSecret) {
        console.error("Unauthorized worker callback - invalid secret");
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized" 
        });
      }

      // Validate required fields
      if (!queueId || !jobId || !userId || !finalStatus) {
        console.error("Missing required fields in worker callback", { queueId, jobId, userId, finalStatus });
        return res.status(400).json({ 
          success: false, 
          error: "Missing required fields" 
        });
      }

      console.log(`📞 Worker callback: Job ${jobId} (Queue ${queueId}) - Final Status: ${finalStatus}`);

      // Update the job queue status
      const now = new Date();
      let queueStatus = 'completed';
      let applicationStatus = 'applied';

      if (finalStatus === 'completed') {
        queueStatus = 'completed';
        applicationStatus = 'applied';
      } else if (finalStatus === 'skipped') {
        queueStatus = 'skipped';
        applicationStatus = 'skipped';
      } else if (finalStatus === 'failed' || finalStatus === 'error') {
        queueStatus = 'failed';
        applicationStatus = 'failed';
      }

      // Update job queue record
      await storage.updateQueuedJob(queueId, {
        status: queueStatus as any,
        error: finalStatus === 'failed' ? message : undefined,
        processedAt: now,
        updatedAt: now
      });

      // Update job tracker record
      await storage.updateJob(jobId, {
        status: finalStatus === 'completed' ? 'Applied' : 'Saved', // This is what getJobsAppliedToday counts!
        applicationStatus: applicationStatus as any,
        appliedAt: finalStatus === 'completed' ? now : undefined,
        submittedAt: now,
        updatedAt: now
      });

      // If successful, increment daily application count for subscription limits
      if (finalStatus === 'completed') {
        // Get user to check current daily count
        const user = await storage.getUser(userId);
        if (user) {
          console.log(`✅ Application submitted successfully for user ${userId} - updating daily limits`);
          
          // Get job details for better log message
          const jobDetails = await storage.getJob(jobId);
          const jobTitle = jobDetails?.jobTitle || "Unknown Job";
          const company = jobDetails?.company || "Unknown Company";
          
          // Create auto-apply log entry with specific job details
          const { createAutoApplyLog } = await import("./services/auto-apply-service.js");
          await createAutoApplyLog({
            userId,
            jobId,
            status: "Applied",
            message: `Application submitted successfully for ${company} - ${jobTitle}`
          });
        }
      }

      console.log(`✅ Job status updated: Queue ${queueId} -> ${queueStatus}, Job ${jobId} -> ${applicationStatus}`);

      res.json({ 
        success: true, 
        message: "Job status updated successfully",
        queueStatus,
        applicationStatus
      });

    } catch (error: any) {
      console.error("Error in worker callback:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to update job status"
      });
    }
  });

  // API endpoint to retrieve application statistics for debugging
  app.get("/api/application-stats", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Only allow admins or in development mode
    const isAdmin = req.user.isAdmin === true;
    const isDevelopment = process.env.NODE_ENV === "development";

    if (!isDevelopment && !isAdmin) {
      return res.status(403).json({ message: "Forbidden - Admin access required" });
    }

    try {
      // Get statistics from the Workable scraper
      const stats = workableScraper.getApplicationStatistics();

      // Return the statistics
      res.json({
        stats,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      });
    } catch (error: any) {
      console.error("Error retrieving application statistics:", error);
      res.status(500).json({
        message: error.message || "Failed to retrieve application statistics",
        success: false
      });
    }
  });

  // API endpoint to add mock data for testing application statistics
  app.post("/api/application-stats/mock", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Only allow in development mode
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!isDevelopment) {
      return res.status(403).json({ message: "Endpoint only available in development mode" });
    }

    try {
      // Import the mock data functions
      const { mockApplicationData } = await import('./tests/mock-application-data.js');

      // Add mock data
      const stats = mockApplicationData();

      // Return the statistics
      res.json({
        message: "Mock application statistics data added successfully",
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error adding mock application statistics:", error);
      res.status(500).json({
        message: error.message || "Failed to add mock application statistics",
        success: false
      });
    }
  });

  // API endpoint to test a specific URL
  app.post("/api/application-stats/test-url", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // Only allow in development mode
    const isDevelopment = process.env.NODE_ENV === "development";
    if (!isDevelopment) {
      return res.status(403).json({ message: "Endpoint only available in development mode" });
    }

    try {
      const { url, isSuccess, details } = req.body;

      if (!url) {
        return res.status(400).json({ message: "URL is required" });
      }

      // Import the test URL function
      const { testSpecificUrl } = await import('./tests/mock-application-data.js');

      // Test the specific URL
      const stats = testSpecificUrl(url, isSuccess === true, details || {});

      // Return the statistics
      res.json({
        message: `Test data added for URL: ${url}`,
        stats,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error testing specific URL:", error);
      res.status(500).json({
        message: error.message || "Failed to test specific URL",
        success: false
      });
    }
  });

  // Complete onboarding
  app.post("/api/complete-onboarding", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Not authenticated" });

    try {
      const updatedUser = await storage.updateUser(req.user.id, { onboardingCompleted: true });
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Don't send password back to client
      const { password, ...safeUser } = updatedUser;

      res.json(safeUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to complete onboarding" });
    }
  });

  // Stripe checkout endpoints
  app.post("/api/checkout", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!stripe) {
      return res.status(500).json({ error: "Stripe integration not configured" });
    }

    try {
      const { planId } = req.body;
      const userId = req.user.id;

      // Validate the plan
      const plan = subscriptionPlans.find(p => p.id === planId);
      if (!plan) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      // Convert plan price from display format to cents (e.g., "$99" -> 9900)
      let price = parseInt(plan.totalPrice.replace(/[^0-9]/g, '')) * 100;

      // Get price ID based on the planId
      let priceId;
      switch (planId) {
        case "two_weeks":
          priceId = process.env.STRIPE_PRICE_TWO_WEEKS;
          break;
        case "one_month_silver":
          priceId = process.env.STRIPE_PRICE_ONE_MONTH_SILVER;
          break;
        case "one_month_gold":
          priceId = process.env.STRIPE_PRICE_ONE_MONTH_GOLD;
          break;
        case "three_months_gold":
          priceId = process.env.STRIPE_PRICE_THREE_MONTHS_GOLD;
          break;
        default:
          // If no price ID is configured, use dynamic pricing
          priceId = null;
      }

      let sessionConfig: Stripe.Checkout.SessionCreateParams;

      if (priceId) {
        // Use price ID if available
        sessionConfig = {
          payment_method_types: ['card'],
          line_items: [
            {
              price: priceId,
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: `${req.headers.origin}/dashboard?payment=success&plan=${planId}`,
          cancel_url: `${req.headers.origin}/pricing?payment=cancelled`,
          metadata: {
            userId: userId.toString(),
            planId
          },
          customer_email: req.user.email
        };
      } else {
        // Fallback to dynamic pricing
        sessionConfig = {
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: `AIJobApply ${plan.name} Subscription`,
                  description: `Includes ${plan.resumeLimit} ${plan.resumeLimit > 1 ? 'resumes' : 'resume'} and ${plan.dailyLimit} applications per day.`,
                },
                unit_amount: price,
                recurring: {
                  interval: planId === 'two_weeks' ? 'week' : 'month',
                  interval_count: planId === 'two_weeks' ? 2 : planId === 'three_months_gold' ? 3 : 1,
                },
              },
              quantity: 1,
            },
          ],
          mode: 'subscription',
          success_url: `${req.headers.origin}/dashboard?payment=success&plan=${planId}`,
          cancel_url: `${req.headers.origin}/pricing?payment=cancelled`,
          metadata: {
            userId: userId.toString(),
            planId
          },
          customer_email: req.user.email
        };
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create(sessionConfig);

      // Update the user with the session ID
      await storage.updateUser(userId, {
        stripeSessionId: session.id
      });

      // Return the session URL to the frontend
      res.json({ url: session.url });
    } catch (error) {
      console.error('Stripe checkout error:', error);
      res.status(500).json({ error: 'Failed to create checkout session' });
    }
  });

  // For backward compatibility
  app.post("/api/create-checkout-session", async (req, res) => {
    // Redirect to the new endpoint
    req.url = '/api/checkout';
    app._router.handle(req, res);
  });

  // Subscription cancellation endpoint
  app.post("/api/cancel-subscription", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!stripe) {
      return res.status(500).json({ error: "Stripe integration not configured" });
    }

    try {
      const user = req.user;

      // Check if user has a subscription
      if (!(user as any).stripeSubscriptionId) {
        return res.status(400).json({ error: "No active subscription found" });
      }

      // Cancel at period end to let the user keep using the service until the end of the billing period
      await stripe.subscriptions.update((user as any).stripeSubscriptionId, {
        cancel_at_period_end: true
      });

      res.json({ success: true, message: "Subscription will be canceled at the end of the billing period" });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });

  // Stripe webhook handler for completed payments
  app.post('/api/webhook', async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe integration not configured" });
    }

    const signature = req.headers['stripe-signature'] as string;

    // If we have a webhook secret configured, verify the signature
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      try {
        const event = stripe.webhooks.constructEvent(
          req.body,
          signature,
          process.env.STRIPE_WEBHOOK_SECRET
        );

        // Process different event types
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;

            // Retrieve the customer who made the purchase
            const userId = parseInt(session.metadata?.userId || '0');
            const planId = session.metadata?.planId;

            if (!userId || !planId) {
              console.error('Missing user ID or plan ID in session metadata');
              return res.status(400).json({ error: 'Missing metadata' });
            }

            try {
              // Store customer ID if available
              const customerId = session.customer as string;

              // Find the plan details
              const plan = subscriptionPlans.find(p => p.id === planId);
              if (!plan) {
                console.error(`Invalid plan ID: ${planId}`);
                return res.status(400).json({ error: "Invalid plan ID" });
              }

              // Calculate end date based on plan duration
              const now = new Date();
              let endDate = new Date(now);

              if (planId === 'two_weeks') {
                endDate.setDate(now.getDate() + 14); // 2 weeks
              } else if (planId === 'one_month_silver' || planId === 'one_month_gold') {
                endDate.setDate(now.getDate() + 30); // 1 month
              } else if (planId === 'three_months_gold') {
                endDate.setDate(now.getDate() + 90); // 3 months
              }

              // Update the user with their new subscription
              const validSubscriptionPlans = subscriptionPlans.map(plan => plan.id);
              if (validSubscriptionPlans.includes(planId as any)) {
                const updateData: Partial<User> = {
                  subscriptionPlan: planId as any, // Type assertion to bypass the type check
                  subscriptionStartDate: now,
                  subscriptionEndDate: endDate,
                  stripeSessionId: session.id,
                };

                // Add customer ID if available
                if (customerId) {
                  updateData.stripeCustomerId = customerId;
                }

                // If there's subscription info in the session, save it
                if (session.subscription) {
                  updateData.stripeSubscriptionId = session.subscription as string;
                }

                await storage.updateUser(userId, updateData);
              } else {
                console.error(`Invalid plan ID: ${planId} is not in valid subscription plans`);
              }

              // console.log(`User ${userId} subscribed to ${planId} - Payment completed`);
            } catch (error) {
              console.error('Error processing subscription:', error);
              return res.status(500).json({ error: 'Failed to process subscription' });
            }
            break;
          }

          case 'customer.subscription.created': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            try {
              // Find user by Stripe customer ID
              const user = await storage.getUserByStripeCustomerId(customerId);

              if (user) {
                // console.log(`Subscription created for user ${user.id} (Customer: ${customerId}) - Subscription ID: ${subscription.id}`);

                // Store the subscription ID
                await storage.updateUser(user.id, {
                  stripeSubscriptionId: subscription.id
                });
              } else {
                console.error(`Could not find user with Stripe customer ID: ${customerId}`);
              }
            } catch (error) {
              console.error('Error processing subscription creation:', error);
              return res.status(500).json({ error: 'Failed to process subscription creation' });
            }
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;

            try {
              // Find user by Stripe customer ID
              const user = await storage.getUserByStripeCustomerId(customerId);

              if (user) {
                // console.log(`Subscription cancelled for user ${user.id} (Customer: ${customerId}) - Subscription ID: ${subscription.id}`);

                // Let the subscription run until the end date, keep the plan as is
                // If you want to immediately cancel, you could set subscriptionPlan back to "FREE"
                await storage.updateUser(user.id, {
                  stripeSubscriptionId: null // Remove the subscription ID
                });
              } else {
                console.error(`Could not find user with Stripe customer ID: ${customerId}`);
              }
            } catch (error) {
              console.error('Error processing subscription cancellation:', error);
              return res.status(500).json({ error: 'Failed to process subscription cancellation' });
            }
            break;
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as Stripe.Invoice;
            const customerId = invoice.customer as string;

            try {
              // Find user by Stripe customer ID
              const user = await storage.getUserByStripeCustomerId(customerId);

              if (user) {
                // console.log(`Payment failed for user ${user.id} (Customer: ${customerId}) - Invoice: ${invoice.id}`);

                // Optional: You could add logic here to notify the user or mark the subscription as failed
                // For example, add a failedPaymentCount field to the user schema and increment it

                // For now, just log the failure
                // console.log(`Payment failed for invoice ${invoice.id}, amount: ${invoice.amount_due}, customer: ${customerId}`);
              } else {
                console.error(`Could not find user with Stripe customer ID: ${customerId}`);
              }
            } catch (error) {
              console.error('Error processing payment failure:', error);
              return res.status(500).json({ error: 'Failed to process payment failure notification' });
            }
            break;
          }
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }
    } else {
      // If no webhook secret, just acknowledge receipt
      console.warn('Missing STRIPE_WEBHOOK_SECRET environment variable');
      res.json({ received: true });
    }
  });

  // Job search testing endpoint
  app.get("/api/jobs/search", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { searchJobs } = await import("./services/job-scraper.js");
      const { location = "", keywords = "" } = req.query;

      // Split keywords by commas if provided
      const keywordArray = typeof keywords === 'string' && keywords
        ? keywords.split(',').map(k => k.trim())
        : [];

      // Get user location if none provided
      let searchLocation = typeof location === 'string' ? location : "";
      if (!searchLocation) {
        const user = await storage.getUser(req.user.id);
        searchLocation = user?.location || "United States";
      }

      // console.log(`Searching for jobs with keywords: [${keywordArray.join(', ')}] in location: ${searchLocation}`);

      const jobs = await searchJobs(req.user.id, {
        keywords: keywordArray.length > 0 ? keywordArray : undefined,
        location: searchLocation,
        limit: 10
      });

      res.json({ jobs, count: jobs.length });
    } catch (error: any) {
      console.error("Error searching for jobs:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Job matching API endpoint - tests AI-powered resume-to-job matching
  app.post("/api/jobs/match", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    try {
      const { jobTitle, company, description, applyUrl, location, source, externalJobId } = req.body;

      // Validate required fields
      if (!jobTitle || !company || !description) {
        return res.status(400).json({ message: "Missing required job details" });
      }

      // Import the job matching service
      const { scoreJobFit } = await import("./services/job-matching-service.js");

      // Create job object
      const jobListing = {
        jobTitle,
        company,
        description,
        applyUrl: applyUrl || "",
        location: location || "",
        source: source || "manual",
        externalJobId: externalJobId || `manual-${Date.now()}`
      };

      // Get match score and explanation
      const matchResult = await scoreJobFit(req.user.id, jobListing);

      res.json({
        job: jobListing,
        matchScore: matchResult.matchScore,
        matchReasons: matchResult.reasons,
        success: true
      });
    } catch (error: any) {
      console.error("Error performing job match:", error);
      res.status(500).json({
        message: error.message,
        success: false,
        matchScore: 0,
        matchReasons: ["Error processing match request"]
      });
    }
  });

  // 🚨 PLAN-BASED ERROR HANDLING
  // Handle plan restriction errors
  app.use(handlePlanErrors);

  const httpServer = createServer(app);
  return httpServer;
}