import {
  users, type User, type InsertUser,
  applicationAnswers, type ApplicationAnswer, type InsertApplicationAnswer,
  resumes, type Resume, type InsertResume,
  jobTracker, type JobTracker, type InsertJobTracker,
  jobQueue, type JobQueue, type InsertJobQueue,
  userProfiles, type UserProfile, type InsertUserProfile,
  portfolios, type Portfolio, type InsertPortfolio,
  autoApplyLogs,
  applicationPayloads,
  type ApplicationPayload,
  type InsertApplicationPayload,
  type AutoApplyLog,
  type InsertAutoApplyLog,
} from "@shared/schema.js";

// Import jobLinks from local schema
// @ts-ignore - local schema types
import { jobLinks } from "./local-schema.js";

// Type definitions for JobLinks
type JobLinks = typeof jobLinks.$inferSelect;
type InsertJobLinks = typeof jobLinks.$inferInsert;
import { db } from "./db.js";
import { eq, and, gte, gt, lt, count, desc, asc, or } from "drizzle-orm";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db.js";

const PostgresSessionStore = connectPgSimple(session);

export interface IStorage {
  // User Methods
  getUser(id: number): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<User>): Promise<User | undefined>;

  // User Profile Methods
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  updateUserProfile(userId: number, data: Partial<UserProfile>): Promise<UserProfile | undefined>;
  calculateProfileCompleteness(userId: number): Promise<number>;

  // Portfolio Methods
  getUserPortfolios(userId: number): Promise<Portfolio[]>;
  getPortfolio(id: number): Promise<Portfolio | undefined>;
  createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio>;
  updatePortfolio(id: number, data: Partial<Portfolio>): Promise<Portfolio | undefined>;
  deletePortfolio(id: number): Promise<boolean>;

  // Application Answers Methods
  getApplicationAnswers(userId: number): Promise<ApplicationAnswer[]>;
  createApplicationAnswer(answer: InsertApplicationAnswer): Promise<ApplicationAnswer>;
  updateApplicationAnswer(id: number, data: Partial<ApplicationAnswer>): Promise<ApplicationAnswer | undefined>;
  deleteApplicationAnswer(id: number): Promise<boolean>;

  // Resume Methods
  getResume(userId: number): Promise<Resume | undefined>;
  createResume(resume: InsertResume): Promise<Resume>;
  updateResume(userId: number, data: Partial<InsertResume>): Promise<Resume | undefined>;

  // Job Tracker Methods
  getJobs(userId: number): Promise<JobTracker[]>;
  getJobsPaginated(userId: number, page: number, limit: number): Promise<{ jobs: JobTracker[], total: number }>;
  getJobsCount(userId: number): Promise<number>;
  getJob(id: number): Promise<JobTracker | undefined>;
  createJob(job: InsertJobTracker): Promise<JobTracker>;
  updateJob(id: number, data: Partial<JobTracker>): Promise<JobTracker | undefined>;
  deleteJob(id: number): Promise<boolean>;
  getJobsAppliedToday(userId: number, startDate: Date): Promise<number>;

  // Job Queue Methods
  enqueueJob(job: InsertJobQueue): Promise<JobQueue>;
  enqueueJobs(jobs: InsertJobQueue[]): Promise<JobQueue[]>;
  getNextJobsFromQueue(limit: number): Promise<JobQueue[]>;
  getQueuedJobsForUser(userId: number): Promise<JobQueue[]>;
  getQueuedJobsForJobId(jobId: number): Promise<JobQueue[]>;
  updateQueuedJob(id: number, data: Partial<JobQueue>): Promise<JobQueue | undefined>;
  dequeueJob(id: number): Promise<boolean>;

  // Job Links Methods
  addJobLinks(links: InsertJobLinks[]): Promise<JobLinks[]>;
  getJobLinksForUser(userId: number, status?: string): Promise<JobLinks[]>;
  getNextJobLinksToProcess(userId: number, limit: number): Promise<JobLinks[]>;
  updateJobLink(id: number, data: Partial<JobLinks>): Promise<JobLinks | undefined>;
  markJobLinkAsProcessed(id: number, jobTrackerId?: number): Promise<JobLinks | undefined>;
  markJobLinkAsApplied(id: number, jobTrackerId?: number): Promise<JobLinks | undefined>;
  getPendingJobLinksCount(userId: number): Promise<number>;

  // Application Payload Methods
  createApplicationPayload(queuedJobId: number, payload: any): Promise<ApplicationPayload>;
  getApplicationPayload(queuedJobId: number): Promise<any | undefined>;
  deleteApplicationPayload(queuedJobId: number): Promise<boolean>;

  // Get job by external ID (for deduplication)
  getJobByExternalId(externalId: string): Promise<JobTracker | undefined>;

  // Add job to tracker (alias for createJob)
  addJobToTracker(job: InsertJobTracker): Promise<JobTracker>;

  // Update job in tracker (alias for updateJob)
  updateJobInTracker(id: number, data: Partial<JobTracker>): Promise<JobTracker | undefined>;

  // Session Store
  sessionStore: any;
}

export class DatabaseStorage implements IStorage {
  sessionStore: any;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    });
  }

  // User Methods
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.stripeCustomerId, stripeCustomerId));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...insertUser,
        onboardingCompleted: false
      } as any)
      .returning();
    return user;
  }

  async updateUser(id: number, data: Partial<User>): Promise<User | undefined> {
    const [updatedUser] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updatedUser || undefined;
  }

  // Application Answers Methods
  async getApplicationAnswers(userId: number): Promise<ApplicationAnswer[]> {
    return await db
      .select()
      .from(applicationAnswers)
      .where(eq(applicationAnswers.userId, userId));
  }

  async createApplicationAnswer(answer: InsertApplicationAnswer): Promise<ApplicationAnswer> {
    const [newAnswer] = await db
      .insert(applicationAnswers)
      .values(answer as any)
      .returning();
    return newAnswer;
  }

  async updateApplicationAnswer(id: number, data: Partial<ApplicationAnswer>): Promise<ApplicationAnswer | undefined> {
    const [updatedAnswer] = await db
      .update(applicationAnswers)
      .set(data)
      .where(eq(applicationAnswers.id, id))
      .returning();
    return updatedAnswer || undefined;
  }

  async deleteApplicationAnswer(id: number): Promise<boolean> {
    await db
      .delete(applicationAnswers)
      .where(eq(applicationAnswers.id, id));
    return true;
  }

  // Resume Methods
  async getResume(userId: number): Promise<Resume | undefined> {
    const [resume] = await db
      .select()
      .from(resumes)
      .where(eq(resumes.userId, userId));
    return resume || undefined;
  }

  async createResume(resume: InsertResume): Promise<Resume> {
    // First delete any existing resume for this user
    await db
      .delete(resumes)
      .where(eq(resumes.userId, resume.userId));

    // Then create the new one
    const [newResume] = await db
      .insert(resumes)
      .values({
        ...resume,
        uploadedAt: new Date()
      } as any)
      .returning();
    return newResume;
  }

  async updateResume(userId: number, data: Partial<InsertResume>): Promise<Resume | undefined> {
    const [updatedResume] = await db
      .update(resumes)
      .set(data)
      .where(eq(resumes.userId, userId))
      .returning();
    return updatedResume || undefined;
  }

  // Job Tracker Methods
  async getJobs(userId: number): Promise<JobTracker[]> {
    return await db
      .select()
      .from(jobTracker)
      .where(eq(jobTracker.userId, userId));
  }

  async getJobsPaginated(userId: number, page: number, limit: number): Promise<{ jobs: JobTracker[], total: number }> {
    const total = await this.getJobsCount(userId);
    const jobs = await db
      .select()
      .from(jobTracker)
      .where(eq(jobTracker.userId, userId))
      .orderBy(desc(jobTracker.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
    return { jobs, total };
  }

  async getJobsCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(jobTracker)
      .where(eq(jobTracker.userId, userId));
    return result?.count || 0;
  }

  async getJob(id: number): Promise<JobTracker | undefined> {
    const [job] = await db
      .select()
      .from(jobTracker)
      .where(eq(jobTracker.id, id));
    return job || undefined;
  }

  async createJob(job: InsertJobTracker): Promise<JobTracker> {
    const now = new Date();
    const [newJob] = await db
      .insert(jobTracker)
      .values({
        ...job,
        createdAt: now,
        updatedAt: now
      } as any)
      .returning();
    return newJob;
  }

  async updateJob(id: number, data: Partial<JobTracker>): Promise<JobTracker | undefined> {
    try {
      // console.log("Updating job:", id);

      // Add the updated timestamp
      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      // Use standard Drizzle update method
      const [updatedJob] = await db
        .update(jobTracker)
        .set(updateData)
        .where(eq(jobTracker.id, id))
        .returning();

      // console.log("Update result:", updatedJob ? "Success" : "No job updated");
      return updatedJob || undefined;
    } catch (error) {
      console.error("Error in updateJob:", error);
      throw error;
    }
  }

  async deleteJob(id: number): Promise<boolean> {
    try {
      // First, check for and delete any related records in the job queue table
      const queuedJobs = await this.getQueuedJobsForJobId(id);

      // Delete any related queue entries first
      if (queuedJobs.length > 0) {
        for (const queuedJob of queuedJobs) {
          await this.dequeueJob(queuedJob.id);
        }
      }

      // Delete any related auto-apply logs
      await db
        .delete(autoApplyLogs)
        .where(eq(autoApplyLogs.jobId, id));

      // Now delete the actual job record
      await db
        .delete(jobTracker)
        .where(eq(jobTracker.id, id));

      return true;
    } catch (error) {
      console.error("Error in deleteJob:", error);
      throw error;
    }
  }

  async getJobsAppliedToday(userId: number, startDate: Date): Promise<number> {
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);

    // Get count of jobs with status 'Applied' created today
    const result = await db
      .select({ count: count() })
      .from(jobTracker)
      .where(
        and(
          eq(jobTracker.userId, userId),
          eq(jobTracker.status, 'Applied'),
          gte(jobTracker.createdAt, startDate),
          lt(jobTracker.createdAt, endDate)
        )
      );

    return result[0]?.count || 0;
  }

  // Job Queue Methods
  async enqueueJob(job: InsertJobQueue): Promise<JobQueue> {
    // Ensure job has required userId (jobId is now optional)
    if (!job.userId) {
      throw new Error('userId is required for enqueuing a job');
    }

    const [newJob] = await db
      .insert(jobQueue)
      .values(job as any)
      .returning();
    return newJob;
  }

  async enqueueJobs(jobs: InsertJobQueue[]): Promise<JobQueue[]> {
    if (!jobs.length) return [];

    // Validate that all jobs have required fields (jobId is now optional)
    for (const job of jobs) {
      if (!job.userId) {
        throw new Error('userId is required for enqueuing jobs');
      }
    }

    const newJobs = await db
      .insert(jobQueue)
      .values(jobs as any[])
      .returning();
    return newJobs;
  }

  async getNextJobsFromQueue(limit: number): Promise<JobQueue[]> {
    // Get pending jobs ordered by priority (highest first), then created time (oldest first)
    return await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.status, 'pending'))
      .orderBy(desc(jobQueue.priority), asc(jobQueue.createdAt))
      .limit(limit);
  }

  async getQueuedJobsForUser(userId: number): Promise<JobQueue[]> {
    return await db
      .select()
      .from(jobQueue)
      .where(and(
        eq(jobQueue.userId, userId),
        or(
          eq(jobQueue.status, 'pending'),
          eq(jobQueue.status, 'processing'),
          eq(jobQueue.status, 'standby')
        )
      ))
      .orderBy(desc(jobQueue.priority), asc(jobQueue.createdAt));
  }

  async getQueuedJobsForJobId(jobId: number): Promise<JobQueue[]> {
    return await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.jobId, jobId))
      .orderBy(desc(jobQueue.priority), asc(jobQueue.createdAt));
  }

  async updateQueuedJob(id: number, data: Partial<JobQueue>): Promise<JobQueue | undefined> {
    // Add updatedAt timestamp if not provided
    const updateData = {
      ...data,
      updatedAt: data.updatedAt || new Date() // Use provided timestamp or current time
    };

    const [updatedJob] = await db
      .update(jobQueue)
      .set(updateData)
      .where(eq(jobQueue.id, id))
      .returning();
    return updatedJob || undefined;
  }

  async dequeueJob(id: number): Promise<boolean> {
    await db
      .delete(jobQueue)
      .where(eq(jobQueue.id, id));
    return true;
  }

  // Get a single queued job by ID
  async getQueuedJob(id: number): Promise<JobQueue | undefined> {
    const [job] = await db
      .select()
      .from(jobQueue)
      .where(eq(jobQueue.id, id));
    return job || undefined;
  }

  // User Profile Methods
  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return profile || undefined;
  }

  async createUserProfile(profile: InsertUserProfile): Promise<UserProfile> {
    // Check if profile already exists
    if (!profile || !profile.userId) {
      throw new Error('Valid profile with userId is required');
    }

    const existingProfile = await this.getUserProfile(profile.userId);

    if (existingProfile) {
      // Update existing profile - convert it to a compatible format first
      const existingProfileData = {
        ...profile,
        dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth) : undefined
      };
      return await this.updateUserProfile(profile.userId, existingProfileData as any);
    }

    // Calculate initial profile completeness
    const completeness = await this.calculateInitialProfileCompleteness(profile);

    // Create new profile with date conversion for dateOfBirth
    const preparedProfile = {
      ...profile,
      // Handle dateOfBirth - use toString() if it exists or use it as-is
      dateOfBirth: profile.dateOfBirth ? String(profile.dateOfBirth) : undefined,
      profileCompleteness: completeness,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const [newProfile] = await db
      .insert(userProfiles)
      .values(preparedProfile as any)
      .returning();

    return newProfile;
  }

  async updateUserProfile(userId: number, data: Partial<UserProfile>): Promise<UserProfile> {
    // Recalculate profile completeness
    let completeness = await this.calculateProfileCompleteness(userId);

    // Handle dateOfBirth correctly - it's a string in the database schema
    const preparedData = {
      ...data,
      // Handle dateOfBirth - convert to string if it exists
      dateOfBirth: data.dateOfBirth ? String(data.dateOfBirth) : undefined,
      profileCompleteness: completeness,
      updatedAt: new Date(),
    };

    const [updatedProfile] = await db
      .update(userProfiles)
      .set(preparedData as any)
      .where(eq(userProfiles.userId, userId))
      .returning();

    if (!updatedProfile) {
      throw new Error(`Failed to update profile for user ${userId}`);
    }

    return updatedProfile;
  }

  // Helper function to calculate initial profile completeness
  private async calculateInitialProfileCompleteness(profile: InsertUserProfile): Promise<number> {
    const fields = Object.entries(profile).filter(([key, value]) => {
      // Exclude system fields and userId from calculation
      return !['userId', 'createdAt', 'updatedAt', 'profileCompleteness'].includes(key);
    });

    // Count non-empty fields
    const filledFields = fields.filter(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== null && value !== undefined && value !== '';
    });

    // Calculate percentage
    return Math.round((filledFields.length / fields.length) * 100);
  }

  async calculateProfileCompleteness(userId: number): Promise<number> {
    const profile = await this.getUserProfile(userId);

    if (!profile) {
      return 0;
    }

    const fields = Object.entries(profile).filter(([key, value]) => {
      // Exclude system fields and userId from calculation
      return !['id', 'userId', 'createdAt', 'updatedAt', 'profileCompleteness'].includes(key);
    });

    // Count non-empty fields
    const filledFields = fields.filter(([key, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== null && value !== undefined && value !== '';
    });

    // Calculate percentage
    return Math.round((filledFields.length / fields.length) * 100);
  }

  // Portfolio Methods
  async getUserPortfolios(userId: number): Promise<Portfolio[]> {
    return await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.userId, userId));
  }

  async getPortfolio(id: number): Promise<Portfolio | undefined> {
    const [portfolio] = await db
      .select()
      .from(portfolios)
      .where(eq(portfolios.id, id));
    return portfolio || undefined;
  }

  async createPortfolio(portfolio: InsertPortfolio): Promise<Portfolio> {
    if (!portfolio || !portfolio.userId) {
      throw new Error('Valid portfolio with userId is required');
    }

    const [newPortfolio] = await db
      .insert(portfolios)
      .values({
        ...portfolio,
        uploadedAt: new Date(),
      } as any)
      .returning();
    return newPortfolio;
  }

  async updatePortfolio(id: number, data: Partial<Portfolio>): Promise<Portfolio | undefined> {
    const [updatedPortfolio] = await db
      .update(portfolios)
      .set(data)
      .where(eq(portfolios.id, id))
      .returning();
    return updatedPortfolio || undefined;
  }

  async deletePortfolio(id: number): Promise<boolean> {
    await db
      .delete(portfolios)
      .where(eq(portfolios.id, id));
    return true;
  }

  // Job Links Methods
  async addJobLinks(links: InsertJobLinks[]): Promise<JobLinks[]> {
    if (!links || links.length === 0) {
      return [];
    }

    // Extract external job IDs from URLs for deduplication
    const preparedLinks = links.map(link => ({
      ...link,
      externalJobId: link.externalJobId || link.url.split('/').pop(),
      createdAt: new Date(),
    }));

    try {
      const insertedLinks = await db
        .insert(jobLinks)
        .values(preparedLinks as any[])
        .onConflictDoNothing() // Ignore duplicates based on unique constraint
        .returning();

      return insertedLinks;
    } catch (error) {
      // If conflict happens, still return empty array rather than throwing
      // console.log('Some job links may have been duplicates, continuing...');
      return [];
    }
  }

  async getJobLinksForUser(userId: number, status?: string): Promise<JobLinks[]> {
    if (status) {
      return await db
        .select()
        .from(jobLinks)
        .where(and(eq(jobLinks.userId, userId), eq(jobLinks.status, status)))
        .orderBy(desc(jobLinks.priority), asc(jobLinks.createdAt));
    }

    return await db
      .select()
      .from(jobLinks)
      .where(eq(jobLinks.userId, userId))
      .orderBy(desc(jobLinks.priority), asc(jobLinks.createdAt));
  }

  async getNextJobLinksToProcess(userId: number, limit: number): Promise<JobLinks[]> {
    return await db
      .select()
      .from(jobLinks)
      .where(
        and(
          eq(jobLinks.userId, userId),
          or(
            eq(jobLinks.status, 'pending'),
            eq(jobLinks.status, 'processed'), // Include processed jobs for retry logic
            eq(jobLinks.status, 'failed')
          ),
          gt(jobLinks.priority, 0) // skip any links we've demoted
        )
      )
      .orderBy(
        desc(jobLinks.priority), // highest-priority first
        asc(jobLinks.createdAt) // then oldest first
      )
      .limit(limit);
  }

  async updateJobLink(id: number, data: Partial<JobLinks>): Promise<JobLinks | undefined> {
    const [updatedLink] = await db
      .update(jobLinks)
      .set(data)
      .where(eq(jobLinks.id, id))
      .returning();

    return updatedLink || undefined;
  }

  async markJobLinkAsProcessed(id: number, jobTrackerId?: number): Promise<JobLinks | undefined> {
    const updateData: Partial<JobLinks> = {
      status: 'processed',
      processedAt: new Date(),
    };

    return await this.updateJobLink(id, updateData);
  }

  async markJobLinkAsApplied(id: number, jobTrackerId?: number): Promise<JobLinks | undefined> {
    const updateData: Partial<JobLinks> = {
      status: 'applied',
      processedAt: new Date(),
    };

    return await this.updateJobLink(id, updateData);
  }

  async getPendingJobLinksCount(userId: number): Promise<number> {
    const [result] = await db
      .select({ count: count() })
      .from(jobLinks)
      .where(
        and(
          eq(jobLinks.userId, userId),
          or(
            eq(jobLinks.status, 'pending'),
            eq(jobLinks.status, 'failed')
          ),
          gt(jobLinks.priority, 0) // Only count processable job links (same filter as getNextJobLinksToProcess)
        )
      );

    return result?.count || 0;
  }

  async getJobLinksForDebugging(userId: number): Promise<JobLinks[]> {
    return await db
      .select()
      .from(jobLinks)
      .where(
        and(
          eq(jobLinks.userId, userId),
          or(
            eq(jobLinks.status, 'pending'),
            eq(jobLinks.status, 'failed')
          )
        )
      )
      .orderBy(desc(jobLinks.priority))
      .limit(10);
  }

  // Application Payload Methods
  async createApplicationPayload(queuedJobId: number, payload: any): Promise<ApplicationPayload> {
    const [newPayload] = await db
      .insert(applicationPayloads)
      .values({
        queuedJobId,
        payload: JSON.stringify(payload),
      })
      .returning();
    return newPayload;
  }

  async getApplicationPayload(queuedJobId: number): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(applicationPayloads)
      .where(eq(applicationPayloads.queuedJobId, queuedJobId));
    
    if (!result) return undefined;
    
    try {
      return JSON.parse(result.payload);
    } catch (error) {
      console.error('Error parsing application payload:', error);
      return undefined;
    }
  }

  async deleteApplicationPayload(queuedJobId: number): Promise<boolean> {
    await db
      .delete(applicationPayloads)
      .where(eq(applicationPayloads.queuedJobId, queuedJobId));
    return true;
  }

  // Get job by external ID (for deduplication)
  async getJobByExternalId(externalId: string): Promise<JobTracker | undefined> {
    if (!externalId) return undefined;
    
    const [job] = await db
      .select()
      .from(jobTracker)
      .where(eq(jobTracker.externalJobId, externalId));
    return job || undefined;
  }

  // Add job to tracker (alias for createJob)
  async addJobToTracker(job: InsertJobTracker): Promise<JobTracker> {
    return await this.createJob(job);
  }

  // Update job in tracker (alias for updateJob)
  async updateJobInTracker(id: number, data: Partial<JobTracker>): Promise<JobTracker | undefined> {
    return await this.updateJob(id, data);
  }
}

export const storage = new DatabaseStorage();