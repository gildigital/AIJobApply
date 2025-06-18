import { pgTable, text, serial, integer, boolean, timestamp, date, unique, real } from "drizzle-orm/pg-core";
import { z } from "zod";
export const subscriptionPlans = [
    {
        id: "FREE",
        name: "Free",
        price: "$0",
        duration: "forever",
        totalPrice: "$0",
        description: "Basic features",
        aiModel: "Basic AI",
        resumeLimit: 1,
        dailyLimit: 5,
        priority: false,
    },
    {
        id: "two_weeks",
        name: "2 WEEKS",
        price: "$17",
        duration: "2 weeks",
        totalPrice: "$34",
        description: "2-week job application boost",
        aiModel: "ChatGPT 4o-mini",
        resumeLimit: 1,
        dailyLimit: 20,
        priority: false,
    },
    {
        id: "one_month_silver",
        name: "1 MONTH SILVER",
        price: "$12",
        duration: "1 month",
        totalPrice: "$49",
        description: "Standard monthly plan",
        aiModel: "ChatGPT 4o-mini",
        resumeLimit: 1,
        dailyLimit: 40,
        priority: false,
    },
    {
        id: "one_month_gold",
        name: "1 MONTH GOLD",
        price: "$23",
        duration: "1 month",
        totalPrice: "$99",
        description: "Premium monthly plan",
        aiModel: "ChatGPT 4o and Claude 3.7 Sonnet",
        resumeLimit: 1,
        dailyLimit: 100,
        priority: true,
    },
    {
        id: "three_months_gold",
        name: "3 MONTHS GOLD",
        price: "$16",
        duration: "3 months",
        totalPrice: "$199",
        description: "Premium quarterly plan",
        aiModel: "ChatGPT 4o and Claude 3.7 Sonnet",
        resumeLimit: 1,
        dailyLimit: 100,
        priority: true,
    }
];
export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    password: text("password").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    location: text("location"),
    onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
    resumeText: text("resume_text"),
    userSummary: text("user_summary"),
    subscriptionPlan: text("subscription_plan").$type().default("FREE").notNull(),
    subscriptionStartDate: timestamp("subscription_start_date"),
    subscriptionEndDate: timestamp("subscription_end_date"),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSessionId: text("stripe_session_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    isAutoApplyEnabled: boolean("is_auto_apply_enabled").default(false).notNull(),
});
// Use manual schema definition to avoid type errors with drizzle-zod
export const insertUserSchema = z.object({
    username: z.string(),
    password: z.string(),
    name: z.string(),
    email: z.string(),
    location: z.string().optional(),
    onboardingCompleted: z.boolean().optional().default(false),
});
export const applicationAnswers = pgTable("application_answers", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    questionText: text("question_text").notNull(),
    answer: text("answer").notNull(),
    category: text("category").notNull(),
    isOptional: boolean("is_optional").default(false).notNull(),
    type: text("type").notNull(),
});
// Manual schema definition to avoid type errors
export const insertApplicationAnswerSchema = z.object({
    userId: z.number(),
    questionText: z.string(),
    answer: z.string(),
    category: z.string(),
    type: z.string(),
    isOptional: z.boolean().optional().default(false),
});
export const resumes = pgTable("resumes", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    filename: text("filename").notNull(),
    fileData: text("file_data").notNull(), // Base64 encoded data for in-memory storage
    parsedText: text("parsed_text"), // Extracted text content from the resume for AI matching
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
// Manual schema definition to avoid type errors
export const insertResumeSchema = z.object({
    userId: z.number(),
    filename: z.string(),
    fileData: z.string(),
    parsedText: z.string().optional(),
    uploadedAt: z.date().optional(),
});
export const jobTracker = pgTable("job_tracker", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    jobTitle: text("job_title").notNull(),
    company: text("company").notNull(),
    link: text("link"),
    status: text("status").notNull(), // 'saved', 'applied', 'interview', 'offer', 'rejected'
    applicationStatus: text("application_status").default("pending"), // 'pending', 'applied', 'skipped', 'failed'
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    appliedAt: timestamp("applied_at"),
    submittedAt: timestamp("submitted_at"), // When the auto-apply system submitted the application
    externalJobId: text("external_job_id"), // To avoid duplicate applications
    matchScore: integer("match_score"), // 0-100 score for job match percentage
    matchExplanation: text("match_explanation"), // Explanation of why the job is a good match
    source: text("source"), // Source of the job posting (e.g., "adzuna", "linkedin", etc.)
});
export const autoApplyLogs = pgTable("auto_apply_logs", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    jobId: integer("job_id").references(() => jobTracker.id),
    status: text("status").notNull(), // e.g., "Searching", "Evaluating", "Applied", "Failed", "Skipped"
    message: text("message"), // Additional details about the status
    timestamp: timestamp("timestamp").notNull().defaultNow(),
});
// Manual schema definition to avoid type errors
export const insertJobTrackerSchema = z.object({
    userId: z.number(),
    jobTitle: z.string(),
    company: z.string(),
    link: z.string().optional(),
    status: z.string(),
    applicationStatus: z.string().optional(),
    notes: z.string().optional(),
    appliedAt: z.date().optional(),
    submittedAt: z.date().optional(),
    externalJobId: z.string().optional(),
    matchScore: z.number().optional(),
    matchExplanation: z.string().optional(),
    source: z.string().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});
// For autoApplyLogs, create schema manually to avoid schema type errors
export const insertAutoApplyLogSchema = z.object({
    userId: z.number(),
    jobId: z.number().optional(),
    status: z.string(),
    message: z.string().optional(),
});
// Schemas for onboarding forms
export const requiredQuestionsSchema = z.object({
    workAuthorization: z.enum(["yes", "no"]),
    timezone: z.string().min(1, "Time zone is required"),
    education: z.string().min(1, "Education level is required"),
    experience: z.string().min(1, "Years of experience is required"),
    jobTitle: z.string().min(1, "Job title is required"),
    company: z.string().min(1, "Company is required"),
    relocation: z.enum(["yes", "no"]),
    workType: z.string().min(1, "Work type is required"),
    sponsorship: z.enum(["yes", "no"]),
});
export const demographicQuestionsSchema = z.object({
    gender: z.array(z.string()).optional(),
    genderSelfDescribe: z.string().optional(),
    veteranStatus: z.string().optional(),
    race: z.array(z.string()).optional(),
    sexualOrientation: z.array(z.string()).optional(),
    transgender: z.enum(["yes", "no", "no_answer"]).optional(),
    disability: z.enum(["yes", "no", "no_answer"]).optional(),
});
// Job Queue schema
export const jobQueue = pgTable("job_queue", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    jobId: integer("job_id").references(() => jobTracker.id),
    priority: integer("priority").default(0).notNull(),
    status: text("status", { enum: ["pending", "processing", "completed", "failed", "skipped", "standby"] }).default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    error: text("error"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Job Links table - stores scraped job URLs before processing
export const jobLinks = pgTable("job_links", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    url: text("url").notNull(),
    source: text("source").notNull().default("workable"), // Source of the job posting
    externalJobId: text("external_job_id"), // Extracted from URL for deduplication
    query: text("query"), // Search query that found this job
    status: text("status", { enum: ["pending", "processing", "processed", "failed", "skipped"] }).default("pending").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    priority: real("priority").default(1.0).notNull(), // Priority for processing
    error: text("error"),
    attemptCount: integer("attempt_count").default(0).notNull(),
});

// Add unique constraint to prevent duplicate URLs for the same user
export const jobLinksUnique = unique().on(jobLinks.userId, jobLinks.url);

// Manual schema definition to avoid type errors
export const insertJobQueueSchema = z.object({
    userId: z.number(),
    jobId: z.number().optional(),
    priority: z.number().optional().default(0),
    status: z.string().optional().default("pending"),
    createdAt: z.date().optional(),
    processedAt: z.date().optional(),
    error: z.string().optional(),
    attemptCount: z.number().optional().default(0),
    updatedAt: z.date().optional(),
});

// Job Links schema
export const insertJobLinksSchema = z.object({
    userId: z.number(),
    url: z.string(),
    source: z.string().optional().default("workable"),
    externalJobId: z.string().optional(),
    query: z.string().optional(),
    status: z.string().optional().default("pending"),
    createdAt: z.date().optional(),
    processedAt: z.date().optional(),
    priority: z.number().optional().default(1.0),
    error: z.string().optional(),
    attemptCount: z.number().optional().default(0),
});

// User Profile schema with additional fields required by the Profile Management feature
export const userProfiles = pgTable("user_profiles", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id).unique(),
    // Contact Information (required for auto-filling applications)
    fullName: text("full_name"),
    email: text("email"),
    phoneNumber: text("phone_number"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zipCode: text("zip_code"),
    dateOfBirth: date("date_of_birth"),
    // Job Preferences
    jobTitlesOfInterest: text("job_titles_of_interest").array(),
    locationsOfInterest: text("locations_of_interest").array(), // City, State, Country for geographical preferences
    minSalaryExpectation: integer("min_salary_expectation"),
    excludedCompanies: text("excluded_companies").array(),
    willingToRelocate: boolean("willing_to_relocate"),
    matchScoreThreshold: integer("match_score_threshold").default(70),
    // Employment type (full-time, part-time, contract, temporary, internship)
    preferredWorkArrangement: text("preferred_work_arrangement").array(),
    // Workplace type (remote, hybrid, on-site)
    workplaceOfInterest: text("workplace_of_interest").array(),
    // Experience level (entry_level, associate, mid_senior_level, director, executive)
    jobExperienceLevel: text("job_experience_level").array(),
    activeSecurityClearance: boolean("active_security_clearance"),
    clearanceDetails: text("clearance_details"),
    // Online Presence
    personalWebsite: text("personal_website"),
    linkedinProfile: text("linkedin_profile"),
    githubProfile: text("github_profile"),
    portfolioLink: text("portfolio_link"),
    // System Fields
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    profileCompleteness: integer("profile_completeness").default(0).notNull(), // 0-100 percentage
});
// Manual schema definition to avoid type errors
export const insertUserProfileSchema = z.object({
    userId: z.number(),
    fullName: z.string().optional(),
    email: z.string().optional(),
    phoneNumber: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().optional(),
    dateOfBirth: z.date().optional(),
    jobTitlesOfInterest: z.array(z.string()).optional(),
    locationsOfInterest: z.array(z.string()).optional(),
    minSalaryExpectation: z.number().optional(),
    excludedCompanies: z.array(z.string()).optional(),
    willingToRelocate: z.boolean().optional(),
    matchScoreThreshold: z.number().optional(),
    preferredWorkArrangement: z.array(z.string()).optional(),
    workplaceOfInterest: z.array(z.string()).optional(),
    jobExperienceLevel: z.array(z.string()).optional(),
    activeSecurityClearance: z.boolean().optional(),
    clearanceDetails: z.string().optional(),
    personalWebsite: z.string().optional(),
    linkedinProfile: z.string().optional(),
    githubProfile: z.string().optional(),
    portfolioLink: z.string().optional(),
    profileCompleteness: z.number().optional(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
});
// Portfolio schema for file uploads
export const portfolios = pgTable("portfolios", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    filename: text("filename").notNull(),
    fileData: text("file_data").notNull(), // Base64 encoded data
    fileType: text("file_type").notNull(), // MIME type
    uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});
// Manual schema definition to avoid type errors
export const insertPortfolioSchema = z.object({
    userId: z.number(),
    filename: z.string(),
    fileData: z.string(),
    fileType: z.string(),
    uploadedAt: z.date().optional(),
});
// Update validation schemas for the profile form
export const contactInfoSchema = z.object({
    fullName: z.string().min(1, "Full name is required"),
    email: z.string().email("Valid email is required"),
    phoneNumber: z.string().min(10, "Valid phone number is required"),
    address: z.string().min(1, "Address is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    zipCode: z.string().min(5, "ZIP code is required"),
    dateOfBirth: z.date().optional(),
});
export const jobPreferencesSchema = z.object({
    // Required field - we do need at least one job title to search for
    jobTitlesOfInterest: z.array(z.string()).min(1, "At least one job title is required"),
    // All other fields are optional for broader searches
    locationsOfInterest: z.array(z.string()).optional().default([]),
    minSalaryExpectation: z.number().optional(),
    excludedCompanies: z.array(z.string()).optional().default([]),
    willingToRelocate: z.boolean(),
    // Updated to array of employment types - optional
    preferredWorkArrangement: z.array(z.enum(["full-time", "part-time", "contract", "temporary", "internship"])).optional().default([]),
    // New field for workplace preferences (remote, hybrid, on-site) - optional
    workplaceOfInterest: z.array(z.enum(["remote", "hybrid", "on-site"])).optional().default([]),
    // New field for experience level - optional
    jobExperienceLevel: z.array(z.enum(["entry_level", "associate", "mid_senior_level", "director", "executive"])).optional().default([]),
    activeSecurityClearance: z.boolean(),
    clearanceDetails: z.string().optional(),
    matchScoreThreshold: z.number().min(0).max(100).default(70),
});
export const onlinePresenceSchema = z.object({
    personalWebsite: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    linkedinProfile: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    githubProfile: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    portfolioLink: z.string().url("Must be a valid URL").optional().or(z.literal("")),
});
