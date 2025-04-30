/**
 * Integration between WorkableScraper and ScrollBasedScraper
 * This file provides a unified interface to migrate from pagination to infinite scrolling
 */
import { workableScraper, JobListing, WorkableJob } from './workable-scraper';
import { ScrollBasedScraper } from './scroll-based-scraper';

// Create instance here to avoid circular import issues
const scrollBasedScraper = new ScrollBasedScraper();

// Feature flag to control which implementation is used
// Set to true to use the new scroll-based implementation (infinite scrolling)
// Set to false to use the original pagination-based implementation
const USE_SCROLL_BASED_SCRAPER = true; // Keep using scroll-based scraper and fix Playwright worker issues

/**
 * Get Workable jobs using the appropriate scraper implementation
 * This provides a seamless way to transition between implementations
 */
export async function getWorkableJobsForUser(
  userId: number,
  options: {
    useScrollingScraper?: boolean;
    maxJobs?: number;
    maxSearchUrls?: number;
    forceRefresh?: boolean;
    preferredWorkplace?: 'remote' | 'hybrid' | 'any';
  } = {}
): Promise<JobListing[]> {
  // Determine whether to use the scroll-based implementation
  const useScrolling = options.useScrollingScraper !== undefined 
    ? options.useScrollingScraper 
    : USE_SCROLL_BASED_SCRAPER;
  
  console.log(`Using ${useScrolling ? 'SCROLL-BASED' : 'PAGINATION-BASED'} scraper for Workable jobs`);
  
  if (useScrolling) {
    // The scroll-based implementation uses the original implementation's wrapper function
    // but replaces the core scrapeJobsFromSearchUrl method with the new implementation
    const originalScrapeMethod = workableScraper.scrapeJobsFromSearchUrl.bind(workableScraper);
    
    try {
      // Replace the method temporarily with our scroll-based implementation
      workableScraper.scrapeJobsFromSearchUrl = scrollBasedScraper.scrapeJobsFromSearchUrl.bind(scrollBasedScraper);
      
      // Call the original function which will now use our scroll-based implementation
      const result = await workableScraper.getWorkableJobsForUser(
        userId,
        undefined, // progressCallback - we're not using this
        {
          pageSize: 20,
          maxInitialJobs: options.maxJobs || 200, // Increased from 50 to 200 to match our other limits
          searchDepth: options.maxSearchUrls || 3,
          continueToken: undefined,
          workplace: options.preferredWorkplace || 'any',
          remote: options.preferredWorkplace === 'remote'
        }
      );
      
      // Return just the jobs array - the original function might return more info
      return Array.isArray(result) ? result : (result.jobs || []);
    } finally {
      // Always restore the original method when done, even if there was an error
      workableScraper.scrapeJobsFromSearchUrl = originalScrapeMethod;
    }
  } else {
    // Use the original pagination-based implementation
    const result = await workableScraper.getWorkableJobsForUser(
      userId,
      undefined, // progressCallback - we're not using this
      {
        pageSize: 20,
        maxInitialJobs: options.maxJobs || 200, // Increased from 50 to 200 to match our other limits
        searchDepth: options.maxSearchUrls || 3,
        continueToken: undefined,
        workplace: options.preferredWorkplace || 'any',
        remote: options.preferredWorkplace === 'remote'
      }
    );
    
    // Return just the jobs array - the original function might return more info
    return Array.isArray(result) ? result : (result.jobs || []);
  }
}

/**
 * Bypass function to directly call the scroll-based implementation
 * This is useful for testing the new implementation independently
 */
export async function scrapeWithScrolling(
  searchUrl: string, 
  state?: any,
  jobDetailTimeoutMs = 30000
): Promise<JobListing[]> {
  return scrollBasedScraper.scrapeJobsFromSearchUrl(searchUrl, state, jobDetailTimeoutMs);
}