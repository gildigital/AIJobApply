/**
 * Implementation of infinite scrolling-based job scraper for Workable
 * This module replaces pagination with Playwright-based scrolling for more thorough job listing discovery
 */
import Bottleneck from 'bottleneck';
import { EventSource } from 'eventsource';
import { WorkableJob, JobListing } from './workable-scraper';

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

// Configuration for the rate limiter
const limiterConfig = {
  maxConcurrent: 20, // Increased from 5 to 20 to process more jobs concurrently
  minTime: 300, // Reduced from 600ms to 300ms to process faster
  highWater: 100, // Increased from 50 to 100 for larger queue
  strategy: Bottleneck.strategy.BLOCK,
  reservoir: 200, // Increased from 100 to 200 requests maximum
  reservoirRefreshAmount: 200, // Increased accordingly
  reservoirRefreshInterval: 60 * 1000, // 1 minute
};

/**
 * ScrollBasedScraper - A modernized scraper using infinite scrolling for Workable job listings
 */
export class ScrollBasedScraper {
  private limiter: Bottleneck;

  constructor() {
    this.limiter = new Bottleneck(limiterConfig);
  }

  /**
   * This method is no longer used - we've removed pagination logic since we're using scrolling
   * Kept as a comment for historical reference
   * 
   * generateNextPageUrl(currentUrl: string, nextPage: number): string {
   *   try {
   *     const url = new URL(currentUrl);
   *     url.searchParams.set('page', nextPage.toString());
   *     return url.toString();
   *   } catch (error) {
   *     console.error('Error generating next page URL:', error);
   *     return currentUrl;
   *   }
   * }
   */

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
    console.log(`[PROBLEM URL] ${type}: ${url}`, details);
  }

  /**
   * Fetch job details with timeout
   */
  async fetchJobDetailsWithTimeout(
    url: string,
    timeoutMs: number = 30000,
  ): Promise<WorkableJob | null> {
    const controller = new AbortController();
    const signal = controller.signal;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const apiUrl = `http://localhost:5000/api/workable/direct-fetch?url=${encodeURIComponent(url)}`;

      const response = await fetch(apiUrl, {
        signal,
        headers: {
          Accept: 'application/json',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(
          `Failed to fetch job details (${url}): ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const data = await response.json();

      if (data && data.job && typeof data.job.title === 'string') {
        return {
          source: 'workable',
          status: 'found',
          appliedAt: null,
          ...data.job,
        } as WorkableJob;
      } else {
        console.error(`Invalid job data received for ${url}`);
        return null;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        console.warn(`Fetch aborted for ${url} due to timeout.`);
      } else {
        console.error(`Error fetching job details for ${url}:`, error);
      }

      return null;
    }
  }

  /**
   * Scrape job listings using infinite scrolling with Playwright worker
   * Uses Server-Sent Events (SSE) to stream job links from the Playwright worker
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
  
          console.log(`Fetching job listings from: ${correctedUrl} (page ${currentPage}, attempt ${attempt + 1})`);
  
          const workerUrl =
            process.env.PLAYWRIGHT_WORKER_URL || 'https://aijobapply-worker-production.up.railway.app';
          const completeWorkerUrl = workerUrl.startsWith('http')
            ? workerUrl
            : `https://${workerUrl}`;
          console.log(`Using Playwright worker URL: ${completeWorkerUrl}`);
  
          try {
            new URL(`${completeWorkerUrl}/scrape`);
          } catch (error) {
            console.error(`Invalid Playwright worker URL: ${completeWorkerUrl}`, error);
            throw new Error('Invalid Playwright worker URL');
          }
  
          const payload = {
            url: correctedUrl,
            scroll: true,
            maxScrolls: 10,
            selector: '[data-ui="job-item"] a[href*="/view/"]',
          };
  
          console.log(`Requesting Playwright worker to scroll ${correctedUrl}`);
  
          try {
            // Using fetch with manual SSE parsing since EventSource doesn't support POST
            const response = await fetch(`${completeWorkerUrl}/scrape`, {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
              },
              body: JSON.stringify(payload),
            });
  
            if (!response.ok) {
              throw new Error(`SSE request failed: ${response.statusText}`);
            }
  
            const jobLinks: string[] = [];
            const jobListings: JobListing[] = [];
            
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
                      console.log(`Received ${data.links.length} links from SSE stream`);
                      const newLinks = data.links.filter((link: string) => !jobLinks.includes(link));
                      jobLinks.push(...newLinks);
                      console.log(`Added ${newLinks.length} new unique links, total: ${jobLinks.length}`);
                    } else if (data.status === 'complete') {
                      console.log(`SSE streaming complete, received ${jobLinks.length} total links`);
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
  
            // Process the collected links
            const uniqueLinks = Array.from(new Set(jobLinks));
            const totalJobsOnPage = uniqueLinks.length;
            console.log(`Found ${totalJobsOnPage} unique job links for query "${query}" via SSE streaming`);
  
            let newLinks = state
              ? uniqueLinks.filter((link) => {
                  const potentialId = link.split('/').pop();
                  return potentialId && !state.jobIds.has(potentialId);
                })
              : uniqueLinks;
            const newJobsFound = newLinks.length;
  
            // Increased batch size to process more jobs at once
            const BATCH_SIZE = 20; // Process in batches of 20 for better control
            console.log(`Found ${newJobsFound} new job links - will process in batches of ${BATCH_SIZE}`);
            
            // Controlled loop to process ALL job links in batches
            let processedCount = 0;
            let successfulDetailsCount = 0;
            let totalBatches = Math.ceil(newLinks.length / BATCH_SIZE);
            
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
              // Get the current batch of links to process
              const startIndex = batchIndex * BATCH_SIZE;
              const endIndex = Math.min(startIndex + BATCH_SIZE, newLinks.length);
              const currentBatch = newLinks.slice(startIndex, endIndex);
              
              console.log(`Processing batch ${batchIndex + 1}/${totalBatches}: ${currentBatch.length} job links (${processedCount} processed so far)`);
              
              // Process this batch
              const detailFetchPromises = currentBatch.map((jobLink) =>
                this.limiter.schedule(() =>
                  this.fetchJobDetailsWithTimeout(jobLink, jobDetailTimeoutMs).then((detail) => ({
                    link: jobLink,
                    detail,
                  })),
                ),
              );
              
              const results = await Promise.allSettled(detailFetchPromises);
              
              // Process the results from this batch
              let batchSuccessCount = 0;
              for (const result of results) {
                if (result.status === 'fulfilled' && result.value.detail) {
                  const { link, detail } = result.value;
                  batchSuccessCount++;
                  successfulDetailsCount++;
                  
                  if (state) {
                    const potentialId = link.split('/').pop();
                    if (potentialId) state.jobIds.add(potentialId);
                  }
                  
                  const matchScore = this.calculateInitialMatchScore({
                    title: detail.title,
                    company: detail.company,
                    description: detail.description,
                    location: detail.location,
                  });
                  
                  jobListings.push({
                    jobTitle: detail.title,
                    company: detail.company,
                    description: detail.description,
                    applyUrl: link,
                    location: detail.location,
                    source: 'workable',
                    matchScore,
                    externalJobId: link.split('/').pop(),
                  });
                }
              }
              
              processedCount += currentBatch.length;
              console.log(`Batch ${batchIndex + 1} complete: ${batchSuccessCount}/${currentBatch.length} job details fetched successfully`);
              
              // Optional: add a small delay between batches to avoid overloading services
              if (batchIndex < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 500ms pause between batches
              }
            }
  
            console.log(`All batches complete: Successfully fetched ${successfulDetailsCount}/${newJobsFound} job details from ${correctedUrl}`);
            console.log(`Found ${jobListings.length} jobs from ${correctedUrl}, added ${jobListings.length} to results`);
  
            if (state) {
              state.processedUrls.push(correctedUrl);
              state.totalJobsFound += jobListings.length;
  
              const effectivenessScore = totalJobsOnPage > 0 ? newJobsFound / totalJobsOnPage : 0;
              const avgMatchScore =
                jobListings.length > 0
                  ? jobListings.reduce((sum: number, job: any) => sum + (job.matchScore || 70), 0) /
                    jobListings.length
                  : 70;
              const queryEffectivenessKey = `effectiveness_${query}`;
              const previousEffectiveness = state[queryEffectivenessKey] || 0;
              const alpha = 0.3;
              state[queryEffectivenessKey] =
                previousEffectiveness * (1 - alpha) + effectivenessScore * alpha;
  
              state[`processed_${query}`] = true;
  
              if (jobListings.length === 0) {
                console.log(`No new jobs for query "${query}". Stopping scroll.`);
              } else if (newJobsFound > 0) {
                // No need to add pagination URLs since we're using scroll-based approach
                console.log(`Found ${newJobsFound} new jobs through scrolling, no pagination needed.`);
              }
            }
  
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
