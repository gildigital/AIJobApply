/**
 * Implementation of infinite scrolling-based job scraper for Workable
 * This module replaces pagination with Playwright-based scrolling for more thorough job listing discovery
 * Modified to collect job links without processing details to avoid rate limiting
 */
import Bottleneck from 'bottleneck';
import { EventSource } from 'eventsource';
import { WorkableJob, JobListing } from './workable-scraper.js';
import { storage } from '../storage.js';

// Interface for search state used by the scraper
interface SearchState {
  userId: number;
  searchUrls: { url: string; priority: number }[];
  processedUrls: string[];
  currentUrlIndex: number;
  totalJobsFound: number;
  jobIds: Set<string>;
  createdAt: Date;
  [key: string]: any;
}

// Configuration for the rate limiter (much more relaxed since we're not fetching job details)
const limiterConfig = {
  maxConcurrent: 5, // Reduced concurrent requests since we're only scraping links
  minTime: 1000, // 1 second between requests
  highWater: 50,
  strategy: Bottleneck.strategy.BLOCK,
  reservoir: 50,
  reservoirRefreshAmount: 50,
  reservoirRefreshInterval: 60 * 1000, // 1 minute
};

// Declare VITE_BACKEND_URL at the top of the file so it is available for use in all functions
const VITE_BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:5000";

/**
 * ScrollBasedScraper - A modernized scraper using infinite scrolling for Workable job listings
 * Now focuses on collecting job links efficiently without processing details
 */
export class ScrollBasedScraper {
  private limiter: Bottleneck;

  constructor() {
    this.limiter = new Bottleneck(limiterConfig);
  }

  /**
   * Calculate a match score between a job listing and a user profile
   */
  calculateInitialMatchScore(jobInfo: {
    title: string;
    company: string;
    description: string;
    location: string;
  }): number {
    // Calculate a match score between 0-100
    // Default to a medium score for testing
    return 70;
  }

  /**
   * Log information about problematic URLs for analysis
   */
  logProblemUrl(url: string, type: string, details: any) {
    // console.log(`[PROBLEM URL] ${type}: ${url}`, details);
  }

  /**
   * Extract external job ID from a Workable URL
   */
  extractJobId(url: string): string | null {
    try {
      const match = url.match(/\/view\/([A-Za-z0-9]+)/);
      return match ? match[1] : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Scrape job links using infinite scrolling with Playwright worker
   * Uses Server-Sent Events (SSE) to stream job links from the Playwright worker
   * Now stores links in database instead of fetching details
   */
  async scrapeJobsFromSearchUrl(
    searchUrl: string,
    state?: SearchState,
    jobDetailTimeoutMs: number = 30000,
  ): Promise<JobListing[]> {
    try {
      const maxRetries = 3;
      let attempt = 0;
      let correctedUrl = searchUrl;
  
      while (attempt < maxRetries) {
        try {
          // Correct URL parameters
          const urlObj = new URL(searchUrl);
          const query = urlObj.searchParams.get('query') || '';
          if (urlObj.searchParams.has('workspace')) {
            urlObj.searchParams.set(
              'workplace',
              urlObj.searchParams.get('workspace') === 'any'
                ? 'remote'
                : urlObj.searchParams.get('workspace') || 'remote',
            );
            urlObj.searchParams.delete('workspace');
          } else if (!urlObj.searchParams.has('workplace')) {
            urlObj.searchParams.set('workplace', 'remote');
          }
          correctedUrl = urlObj.toString();
          const currentPage = parseInt(urlObj.searchParams.get('page') || '1', 10);
  
          // console.log(`Fetching job listings from: ${correctedUrl} (page ${currentPage}, attempt ${attempt + 1})`);
  
          const workerUrl =
            process.env.VITE_PLAYWRIGHT_WORKER_URL || 'https://aijobapply-worker-production.up.railway.app';
          const completeWorkerUrl = workerUrl.startsWith('http')
            ? workerUrl
            : `https://${workerUrl}`;
          // console.log(`Using Playwright worker URL: ${completeWorkerUrl}`);
  
          try {
            new URL(`${completeWorkerUrl}/scrape`);
          } catch (error) {
            console.error(`Invalid Playwright worker URL: ${completeWorkerUrl}`, error);
            throw new Error('Invalid Playwright worker URL');
          }
  
          const payload = {
            url: correctedUrl,
            scroll: true,
            maxScrolls: 50,
            selector: '[data-ui="job-item"] a[href*="/view/"]',
          };
  
          // console.log(`Requesting Playwright worker to scroll ${correctedUrl}`);
  
          try {
            console.log(`[ScrollBasedScraper] 🤖 Making POST request to Playwright worker: ${completeWorkerUrl}/scrape`);
            console.log(`[ScrollBasedScraper] 📦 Payload:`, JSON.stringify(payload, null, 2));
            
            // Using fetch with manual SSE parsing since EventSource doesn't support POST
            const response = await this.limiter.schedule(() =>
              fetch(`${completeWorkerUrl}/scrape`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'text/event-stream'
                },
                body: JSON.stringify(payload),
              })
            );
            
            console.log(`[ScrollBasedScraper] 📡 Response status: ${response.status} ${response.statusText}`);
  
            if (!response.ok) {
              throw new Error(`SSE request failed: ${response.statusText}`);
            }
  
            const jobLinks: string[] = [];
            
            // Process the SSE stream
            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
  
            let processingComplete = false;
            while (!processingComplete) {
              const { done, value } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n\n');
              buffer = lines.pop() || '';
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.status === 'links' && Array.isArray(data.links)) {
                      // console.log(`Received ${data.links.length} links from SSE stream`);
                      const newLinks = data.links.filter((link: string) => !jobLinks.includes(link));
                      jobLinks.push(...newLinks);
                      // console.log(`Added ${newLinks.length} new unique links, total: ${jobLinks.length}`);
                    } else if (data.status === 'complete') {
                      // console.log(`SSE streaming complete, received ${jobLinks.length} total links`);
                      processingComplete = true;
                      break;
                    } else if (data.status === 'error') {
                      console.error(`SSE streaming error: ${data.error}`);
                      throw new Error(data.error);
                    }
                  } catch (error) {
                    console.error(`Error parsing SSE event: ${error}`);
                  }
                }
              }
            }
  
            // Process the collected links - store them instead of fetching details
            const uniqueLinks = Array.from(new Set(jobLinks));
            const totalJobsOnPage = uniqueLinks.length;
            // console.log(`Found ${totalJobsOnPage} unique job links for query "${query}" via SSE streaming`);
  
            let newLinks = state
              ? uniqueLinks.filter((link) => {
                  const potentialId = link.split('/').pop();
                  return potentialId && !state.jobIds.has(potentialId);
                })
              : uniqueLinks;
            const newJobsFound = newLinks.length;

            // console.log(`Found ${newJobsFound} new job links - will store them for processing`);
            
            // Store job links in database instead of processing them immediately
            if (newJobsFound > 0 && state?.userId) {
              const jobLinksToStore = newLinks.map(link => ({
                userId: state.userId,
                url: link,
                source: 'workable',
                externalJobId: this.extractJobId(link),
                query: query,
                priority: 1.0, // Default priority
              }));

              try {
                const storedLinks = await storage.addJobLinks(jobLinksToStore);
                // console.log(`Stored ${storedLinks.length} job links in database`);
                
                // Add to state for tracking
                if (state) {
                  newLinks.forEach(link => {
                    const potentialId = this.extractJobId(link);
                    if (potentialId) state.jobIds.add(potentialId);
                  });
                }
              } catch (error) {
                console.error('Error storing job links:', error);
              }
            }

            // Return a count of stored links as JobListing objects for backward compatibility
            const jobListings: JobListing[] = newLinks.map(link => ({
              jobTitle: 'Job Link Stored', // Placeholder - details will be fetched later
              company: 'Pending', // Placeholder
              description: 'Job details will be fetched during processing',
              applyUrl: link,
              location: 'Remote',
              source: 'workable',
              externalJobId: this.extractJobId(link) || undefined,
            }));
  
            if (state) {
              state.processedUrls.push(correctedUrl);
              state.totalJobsFound += jobListings.length;
  
              const effectivenessScore = totalJobsOnPage > 0 ? newJobsFound / totalJobsOnPage : 0;
              const queryEffectivenessKey = `effectiveness_${query}`;
              const previousEffectiveness = state[queryEffectivenessKey] || 0;
              const alpha = 0.3;
              state[queryEffectivenessKey] =
                previousEffectiveness * (1 - alpha) + effectivenessScore * alpha;
  
              state[`processed_${query}`] = true;
  
              if (jobListings.length === 0) {
                // console.log(`No new jobs for query "${query}". Stopping scroll.`);
              } else if (newJobsFound > 0) {
                // console.log(`Found ${newJobsFound} new jobs through scrolling, no pagination needed.`);
              }
            }

            // console.log(`Found ${jobListings.length} jobs from ${correctedUrl}, added ${jobListings.length} to results`);
            return jobListings;
          } catch (innerError: any) {
            // If the streaming approach fails, we'll just retry
            console.error(`SSE streaming failed: ${innerError.message}, retrying...`);
            throw innerError; // Let the outer catch handle retry logic
          }
        } catch (error: any) {
          attempt++;
          console.error(`Error scraping ${correctedUrl} (attempt ${attempt}/${maxRetries}): ${error.message}`);
          
          if (attempt >= maxRetries) {
            console.error(`Failed to scrape ${correctedUrl} after ${maxRetries} attempts`);
            if (state) {
              state.processedUrls.push(correctedUrl);
              state[`error_count_${correctedUrl}`] = maxRetries;
            }
            return [];
          }
          
          // Delay before retrying
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
      
      // This point should not be reached, but just in case:
      return [];
    } catch (finalError: any) {
      console.error(`Unhandled error in scrapeJobsFromSearchUrl: ${finalError.message}`);
      if (state) {
        state.processedUrls.push(searchUrl);
      }
      return [];
    }
  }
}
