/**
 * Job Scraper Service - Integration with external job APIs
 * 
 * Phase 1: Adzuna API Integration
 */

import { storage } from "../storage.js";
import { User, Resume } from "@shared/schema.js";

// Define a more comprehensive job listing type specific to our scraper
export interface JobListing {
  jobTitle: string;
  company: string;
  location: string;  // Added location field
  description: string;
  applyUrl: string;
  postedAt?: string; // Added posted date
  source: string;    // Added source field (e.g., "adzuna")
  externalJobId: string;
}

// Check if Adzuna credentials exist
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

/**
 * Main function to search for jobs using external APIs
 * 
 * @param userId The ID of the user to search jobs for
 * @param searchParams Search parameters including keywords, location, etc.
 * @returns A list of job listings matching the search criteria
 */
export async function searchJobs(userId: number, searchParams: {
  keywords?: string[],
  location?: string,
  radius?: number,
  limit?: number
}): Promise<JobListing[]> {
  try {
    console.log(`🔍 searchJobs called with params:`, JSON.stringify(searchParams));
    
    // Get user data for personalized search
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Get user's resume to extract keywords if needed
    const resume = await storage.getResume(userId);
    
    // Get user's profile to access job preferences
    const profile = await storage.getUserProfile(userId);
    
    // Extract job titles from profile if available
    let extractedKeywords: string[] = [];
    
    // The field is jobTitlesOfInterest in the TypeScript code, but we handle both formats just in case
    // the data model or API returns it differently
    if (profile?.jobTitlesOfInterest && profile.jobTitlesOfInterest.length > 0) {
      console.log(`✅ Using job titles from profile: ${profile.jobTitlesOfInterest.join(', ')}`);
      extractedKeywords = [...extractedKeywords, ...profile.jobTitlesOfInterest];
    } else if (profile && (profile as any).job_titles_of_interest && (profile as any).job_titles_of_interest.length > 0) {
      // Access snake_case version using type assertion
      const jobTitles = (profile as any).job_titles_of_interest;
      console.log(`✅ Using job titles from profile (snake_case property): ${jobTitles.join(', ')}`);
      extractedKeywords = [...extractedKeywords, ...jobTitles];
    }
    
    // If provided keywords exist, use them first
    const keywords = searchParams.keywords && searchParams.keywords.length > 0 
      ? searchParams.keywords 
      : extractedKeywords.length > 0 
        ? extractedKeywords 
        : await extractKeywordsFromUser(user, resume);
    
    console.log(`Final keywords for search: ${keywords.join(', ')}`);
    
    // Default location if none provided (can be customized per user)
    const location = searchParams.location || "United States";
    
    // Default limit if none provided
    const limit = searchParams.limit || 10;
    
    // Pre-process location string for better API compatibility
    let searchLocation = location;
    
    // Handle specific location formatting to improve API success rate
    if (location.includes(",")) {
      // For city-state format like "San Diego, CA", try to simplify
      const parts = location.split(",").map(p => p.trim());
      if (parts.length === 2) {
        // Just use the city name for better results with Adzuna
        if (parts[0].length > 0) {
          searchLocation = parts[0];
          console.log(`Simplified location from "${location}" to "${searchLocation}" for better API results`);
        }
      }
    }
    
    // Search Adzuna for jobs
    console.log(`Searching Adzuna for jobs in ${searchLocation} with keywords: ${keywords.join(", ")}`);
    const adzunaJobs = await searchAdzunaJobs(keywords, searchLocation, limit);
    
    return adzunaJobs;
  } catch (error) {
    console.error("Error searching for jobs:", error);
    
    // If error occurred in job search, we return an empty array rather than failing
    return [];
  }
}

/**
 * Search for jobs using the Adzuna API
 * 
 * @param keywords List of keywords to search for
 * @param location Location to search in
 * @param limit Maximum number of results to return
 * @returns List of job listings from Adzuna
 */
async function searchAdzunaJobs(keywords: string[], location: string, limit: number = 10): Promise<JobListing[]> {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    console.error("Adzuna API credentials not found");
    return [];
  }

  try {
    // Make separate API requests for each job title rather than combining them
    // This follows the Adzuna API's recommended usage pattern
    let allJobs: JobListing[] = [];
    
    // If we have specific keywords, search for each one individually
    if (keywords.length > 0) {
      console.log(`Making separate API requests for ${keywords.length} job titles`);
      
      // Create a search array - use original keywords plus some fallbacks if we have few keywords
      const searchQueries = [...keywords];
      
      // Add fallback searches if needed
      if (keywords.length < 2) {
        if (!keywords.some(k => k.toLowerCase().includes('software developer'))) {
          searchQueries.push('software developer');
        }
        if (!keywords.some(k => k.toLowerCase().includes('entry level'))) {
          searchQueries.push('entry level developer');
        }
      }
      
      let searchCount = 0;
      const maxSearches = 3; // Limit the number of searches to avoid rate limiting
      
      // Make requests for each search query until we find jobs or hit the limit
      for (const query of searchQueries) {
        // Stop after a reasonable number of searches or if we found jobs
        if (searchCount >= maxSearches || allJobs.length > 10) {
          break;
        }
        searchCount++;
        
        console.log(`Search ${searchCount}/${maxSearches}: "${query}" in ${location}`);
        
        let apiUrl = "";
        let isRemoteSearch = false;
        
        // Handle special case for Remote location
        if (location.toLowerCase() === "remote") {
          isRemoteSearch = true;
          // For remote jobs, search nationwide and add "remote" to the query
          // Fix: Only add remote keyword if it's not already in the query
          const queryWithRemote = query.toLowerCase().includes('remote') ? query : query + " remote";
          apiUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=${limit * 2}&what=${encodeURIComponent(queryWithRemote)}&content-type=application/json`;
          console.log(`Searching for remote "${queryWithRemote}" jobs nationwide`);
        } else {
          // For location-based jobs, use the location parameter
          apiUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=${limit}&what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}&content-type=application/json`;
          console.log(`Searching for "${query}" jobs in ${location}`);
        }
        
        console.log("API URL:", apiUrl);
        
        try {
          const response = await fetch(apiUrl);
          
          if (!response.ok) {
            console.error(`Adzuna API error (${response.status}) for "${query}"`);
            continue; // Skip to next search
          }
          
          const data = await response.json();
          
          console.log(`Adzuna API returned ${data?.count || 0} results for "${query}" in ${location}`);
          
          if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
            console.log(`No results for "${query}" in ${location}, trying next search`);
            continue;
          }
          
          // Map API results to our job listing format
          const mappedJobs: JobListing[] = data.results.map((job: any): JobListing => ({
            jobTitle: job.title || "Unknown Position",
            company: job.company?.display_name || "Unknown Company",
            location: job.location?.display_name || "Remote",
            description: job.description || "No description provided",
            applyUrl: job.redirect_url || "",
            postedAt: job.created || new Date().toISOString(),
            source: "adzuna",
            externalJobId: job.id?.toString() || "",
          }));
          
          console.log(`Mapped ${mappedJobs.length} jobs for "${query}" in ${location}`);
          
          // If this was a remote search, filter for jobs that mention remote
          if (isRemoteSearch) {
            const remoteTerms = ["remote", "work from home", "virtual", "telecommute"];
            const remoteJobs = mappedJobs.filter((job: JobListing) => {
              const jobText = `${job.jobTitle} ${job.description}`.toLowerCase();
              return remoteTerms.some(term => jobText.includes(term));
            });
            
            console.log(`Filtered to ${remoteJobs.length} actual remote jobs for "${query}"`);
            allJobs = [...allJobs, ...remoteJobs];
          } else {
            allJobs = [...allJobs, ...mappedJobs];
          }
        } catch (error) {
          console.error(`Error in search for "${query}" in ${location}:`, error);
          // Continue with next search
        }
      }
    } else {
      // No specific keywords provided, use default search
      const defaultQueries = ['software developer', 'entry level developer', 'junior developer'];
      console.log(`No specific job titles provided. Using defaults: ${defaultQueries.join(', ')}`);
      
      for (const query of defaultQueries.slice(0, 2)) { // Limit to 2 default searches
        let apiUrl = "";
        let isRemoteSearch = false;
        
        if (location.toLowerCase() === "remote") {
          isRemoteSearch = true;
          apiUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=${limit * 2}&what=${encodeURIComponent(query + " remote")}&content-type=application/json`;
        } else {
          apiUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=${limit}&what=${encodeURIComponent(query)}&where=${encodeURIComponent(location)}&content-type=application/json`;
        }
        
        console.log(`Default search for "${query}" in ${location}`);
        console.log("API URL:", apiUrl);
        
        try {
          const response = await fetch(apiUrl);
          
          if (!response.ok) {
            console.error(`Adzuna API error (${response.status}) for "${query}"`);
            continue; // Skip to next search
          }
          
          const data = await response.json();
          
          console.log(`Adzuna API returned ${data?.count || 0} results for "${query}" in ${location}`);
          
          if (!data.results || !Array.isArray(data.results) || data.results.length === 0) {
            console.log(`No results for "${query}" in ${location}, trying next search`);
            continue;
          }
          
          // Map API results to our job listing format
          const mappedJobs: JobListing[] = data.results.map((job: any): JobListing => ({
            jobTitle: job.title || "Unknown Position",
            company: job.company?.display_name || "Unknown Company",
            location: job.location?.display_name || "Remote",
            description: job.description || "No description provided",
            applyUrl: job.redirect_url || "",
            postedAt: job.created || new Date().toISOString(),
            source: "adzuna",
            externalJobId: job.id?.toString() || "",
          }));
          
          console.log(`Mapped ${mappedJobs.length} jobs for "${query}" in ${location}`);
          
          // If this was a remote search, filter for jobs that mention remote
          if (isRemoteSearch) {
            const remoteTerms = ["remote", "work from home", "virtual", "telecommute"];
            const remoteJobs = mappedJobs.filter((job: JobListing) => {
              const jobText = `${job.jobTitle} ${job.description}`.toLowerCase();
              return remoteTerms.some(term => jobText.includes(term));
            });
            
            console.log(`Filtered to ${remoteJobs.length} actual remote jobs for "${query}"`);
            allJobs = [...allJobs, ...remoteJobs];
          } else {
            allJobs = [...allJobs, ...mappedJobs];
          }
        } catch (error) {
          console.error(`Error in search for "${query}" in ${location}:`, error);
          // Continue with next search
        }
      }
    }
    
    console.log(`Completed all searches. Found ${allJobs.length} total jobs.`);
    return allJobs;
  } catch (error) {
    console.error("Error in searchAdzunaJobs:", error);
    return [];
  }
}

/**
 * Extract relevant keywords from user profile and resume
 * 
 * @param user User object from database
 * @param resume User's resume, if available
 * @returns List of keywords relevant to the user's profile
 */
async function extractKeywordsFromUser(user: User, resume?: Resume | undefined): Promise<string[]> {
  // This is a simple implementation that would be enhanced with AI in the future
  const keywords: string[] = [];
  
  // Use the user's name as a keyword
  if (user.name) {
    keywords.push(user.name.split(' ')[0]); // Use first name only
  }
  
  // If we have resume text, use content from the resume for keywords
  if (user.resumeText) {
    // Extract potential job titles from resume text
    const jobTitleKeywords = extractJobTitlesFromText(user.resumeText);
    keywords.push(...jobTitleKeywords);
  }
  
  // If we have a user summary, extract keywords from it
  if (user.userSummary) {
    // Extract important words from user summary
    const summaryKeywords = extractKeywordsFromText(user.userSummary);
    keywords.push(...summaryKeywords);
  }
  
  // We don't want to try to extract keywords from base64-encoded PDF data
  // If resumeText is available in the user object, we already used it above
  // In a production system with AI capabilities, we would parse the PDF properly
  
  // For now, use some sensible defaults if we don't have enough keywords
  if (keywords.length === 0) {
    keywords.push("software", "developer", "engineer");
  }
  
  // Remove duplicates using filter
  return keywords.filter((value, index, self) => self.indexOf(value) === index);
}

/**
 * Simple function to extract job titles from text
 * In a real implementation, this would use NLP/AI
 */
function extractJobTitlesFromText(text: string): string[] {
  const commonTitles = [
    "software engineer", "developer", "frontend", "backend", "full stack",
    "data scientist", "product manager", "project manager", "designer",
    "ui", "ux", "devops", "qa", "sre", "security", "web", "mobile"
  ];
  
  return commonTitles.filter(title => 
    text.toLowerCase().includes(title.toLowerCase())
  );
}

/**
 * Simple function to extract keywords from text
 * In a real implementation, this would use NLP/AI
 */
function extractKeywordsFromText(text: string): string[] {
  const keywords: string[] = [];
  const lowercaseText = text.toLowerCase();
  
  // Look for programming languages
  const languages = ["javascript", "typescript", "python", "java", "c#", "c++", "go", "rust", "ruby", "php"];
  languages.forEach(lang => {
    if (lowercaseText.includes(lang)) {
      keywords.push(lang);
    }
  });
  
  // Look for frameworks
  const frameworks = ["react", "angular", "vue", "node", "express", "django", "flask", "spring", "rails"];
  frameworks.forEach(framework => {
    if (lowercaseText.includes(framework)) {
      keywords.push(framework);
    }
  });
  
  // Look for cloud platforms
  const cloud = ["aws", "azure", "gcp", "cloud", "docker", "kubernetes"];
  cloud.forEach(term => {
    if (lowercaseText.includes(term)) {
      keywords.push(term);
    }
  });
  
  return keywords;
}