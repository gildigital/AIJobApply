/**
 * Job Matching Service - Scores how well a job matches a user's profile
 */

import { storage } from "../storage.js";
import { db } from "../db.js";
import { matchResumeToJob, MatchResult } from "../utils/ai-service.js";
import { JobListing as ScraperJobListing } from "./job-scraper.js";
import { JobListing as AutoApplyJobListing } from "./auto-apply-service.js";
import { jobTracker, InsertJobTracker } from "@shared/schema.js";
import { eq, and } from "drizzle-orm";
import { extractTextFromPDF } from "../utils/pdf-parser.js";

// Generic job type that works with both AutoApplyJobListing and ScraperJobListing
export type JobListing = {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  location?: string;
  postedAt?: string;
  source?: string;
  externalJobId?: string;
};

// Cache for storing match results to avoid duplicate API calls
const matchCache: Map<string, MatchResult> = new Map();

/**
 * Score how well a job matches a user's profile and resume
 * 
 * @param userId User ID
 * @param job Job listing to score against user profile
 * @returns Promise resolving to match score and explanation
 */
export async function scoreJobFit(userId: number, job: JobListing): Promise<MatchResult> {
  // Get the user
  const user = await storage.getUser(userId);
  if (!user) {
    throw new Error("User not found");
  }
  
  // Get the user's resume from the resumes table
  const resume = await storage.getResume(userId);
  
  // If no resume found, return a low score with explanation
  if (!resume) {
    return {
      matchScore: 0, // No match without a resume
      reasons: [
        "Resume content not provided for analysis",
        "Cannot assess skills without resume details",
        "Job description requires specific technical skills"
      ]
    };
  }
  
  // If resume exists but no parsed text, try to extract it from the file data
  let resumeText = resume.parsedText;
  if (!resumeText && resume.fileData) {
    try {
      // Extract text from PDF if it's not already stored
      resumeText = await extractTextFromPDF(Buffer.from(resume.fileData, 'base64'));
      
      // Store the parsed text for future use
      await storage.updateResume(userId, { parsedText: resumeText });
    } catch (error) {
      console.error("Error extracting text from resume:", error);
    }
  }
  
  // If we still don't have resume text, return low score
  if (!resumeText) {
    return {
      matchScore: 0,
      reasons: [
        "Unable to extract text from resume",
        "Please upload a valid PDF resume",
        "Text extraction is required for job matching"
      ]
    };
  }
  
  // Create a cache key for this resume-job pair
  const cacheKey = `${userId}_${job.externalJobId || job.company + job.jobTitle}`;
  
  // Check if we have a cached result
  if (matchCache.has(cacheKey)) {
    // console.log(`Using cached match result for job ${job.jobTitle} at ${job.company}`);
    return matchCache.get(cacheKey)!;
  }
  
  try {
    // Get a match score and explanation from AI
    // console.log(`Scoring job fit for ${job.jobTitle} at ${job.company} using AI`);
    const result = await matchResumeToJob(userId, resumeText, job.description);
    
    // Cache the result
    matchCache.set(cacheKey, result);
    
    return result;
  } catch (error) {
    console.error("Error scoring job fit with AI:", error);
    
    // Fallback to a simple scoring algorithm if AI fails
    return generateFallbackScore(resumeText, job.description);
  }
}

/**
 * Generate a fallback score based on keyword matching
 * This is used if the AI scoring fails
 */
function generateFallbackScore(resumeText: string, jobDescription: string): MatchResult {
  // Simple keyword matching algorithm
  const resumeKeywords = extractKeywords(resumeText);
  const jobKeywords = extractKeywords(jobDescription);
  
  // Count matching keywords
  const matchingKeywords = resumeKeywords.filter(keyword => 
    jobKeywords.includes(keyword)
  );
  
  // Calculate score as percentage of matching keywords
  const matchPercentage = jobKeywords.length > 0 
    ? Math.round((matchingKeywords.length / jobKeywords.length) * 100)
    : 50;
  
  // Cap at 85% since this is just a fallback
  const score = Math.min(85, Math.max(30, matchPercentage)); 
  
  return {
    matchScore: score,
    reasons: [
      "AI scoring unavailable - using keyword matching",
      `Found ${matchingKeywords.length} matching keywords`,
      "Upload resume for better matching"
    ]
  };
}

/**
 * Extract keywords from text for fallback scoring
 */
function extractKeywords(text: string): string[] {
  // Convert to lowercase for case-insensitive matching
  const lowercaseText = text.toLowerCase();
  
  // Common tech keywords to look for
  const techKeywords = [
    "javascript", "typescript", "python", "java", "c#", "go", "rust", "ruby", 
    "react", "angular", "vue", "node", "express", "django", "flask", "spring",
    "aws", "azure", "gcp", "docker", "kubernetes", "devops", "ci/cd",
    "sql", "postgresql", "mysql", "mongodb", "database", "nosql",
    "frontend", "backend", "fullstack", "full-stack", "software engineer", "developer"
  ];
  
  // Filter keywords that appear in the text
  return techKeywords.filter(keyword => lowercaseText.includes(keyword));
}

/**
 * Adds a job to the user's job tracker with match score and explanation
 */
export async function addJobWithMatchScore(
  userId: number,
  job: JobListing,
  matchResult: MatchResult,
  status: string = "Applied"
): Promise<any> {
  const now = new Date();
  
  // Format reasons as a bulleted list
  const matchExplanation = matchResult.reasons.map(reason => `• ${reason}`).join('\n');
  
  // Create job data
  const jobData: InsertJobTracker = {
    userId,
    jobTitle: job.jobTitle,
    company: job.company,
    link: job.applyUrl,
    status: status,
    notes: `Auto-applied via AIJobApply | Match Score: ${matchResult.matchScore}/100`,
    externalJobId: job.externalJobId,
    appliedAt: now,
    matchScore: matchResult.matchScore,
    matchExplanation: matchExplanation,
    source: job.source
  };
  
  // Insert into database
  const [result] = await db.insert(jobTracker).values(jobData as any).returning();
  return result;
}