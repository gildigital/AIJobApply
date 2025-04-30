/**
 * Workable job search parameters
 */
interface WorkableSearchParams {
  // Internal parameters that are mapped to Workable's expected URL parameters
  query?: string;     // Maps to 'query' parameter (search terms for job title/skills)
  location?: string;  // Combined with query parameter (NOT using 'where')
  remote?: boolean;   // Maps to 'workplace=remote' (valid values: 'remote' or 'hybrid', not 'on-site')
  workplace?: 'remote' | 'hybrid' | 'any'; // Explicit workplace parameter (overrides remote)
  days?: 1 | 3 | 7 | 14 | 30 | 'all';  // Maps to 'day_range' (not 'days')
  page?: number;      // Maps to 'page' parameter
}

/**
 * Workable job search result
 */
export interface WorkableJob {
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  source: 'workable';
  appliedAt: Date | null;
  status: 'found' | 'queued' | 'applied' | 'failed' | 'skipped';
}

/**
 * Job listing interface compatible with the auto-apply service
 */
export interface JobListing {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  location: string;
  source: string;
  matchScore?: number;
  externalJobId?: string;
}

import fetch from 'node-fetch';
import Bottleneck from 'bottleneck';
import * as cheerio from 'cheerio';
import { UserProfile } from '@shared/schema';

/**
 * Interface for storing search state between paginated searches
 */
interface SearchState {
  // Search configuration
  userId: number;
  searchUrls: { url: string; priority: number }[]; // Priority queue for search URLs
  processedUrls: string[];
  currentUrlIndex: number;
  
  // Search metadata
  totalJobsFound: number;
  jobIds: Set<string>; // Track job IDs to avoid duplicates
  
  // Pagination
  createdAt: Date;
  
  // Dynamic properties for tracking pagination state
  [key: string]: any; // Allow dynamic properties like 'empty_pages_query'
}

/**
 * Workable scraper service
 * This service builds and executes Workable job searches based on user profile data
 */
export class WorkableScraper {
  private readonly BASE_URL = 'https://jobs.workable.com/search';
  private searchStates: Map<string, SearchState> = new Map();
  
  // Rate limiting settings (5 concurrent, 100/min)
  private limiter = new Bottleneck({
    maxConcurrent: 5,
    minTime: 600, // 600ms per request = 100/min
    reservoir: 100, // Initial number of requests allowed
    reservoirRefreshAmount: 100, // Number of requests to refill
    reservoirRefreshInterval: 60 * 1000, // Refill rate (60 seconds)
  });
  
  // Track problematic URLs for pattern analysis
  private problemUrls = new Map<string, Array<{
    timestamp: Date,
    type: string,
    details: any
  }>>();

  // Track successful URLs for comparison
  private successfulUrls = new Map<string, Array<{
    timestamp: Date,
    fields: number,
    details: any
  }>>();

  /**
   * Log a problematic URL for later analysis
   * This will help understand patterns in failed Workable applications
   */
  logProblemUrl(url: string, type: string, details: any) {
    if (!this.problemUrls.has(url)) {
      this.problemUrls.set(url, []);
    }
    this.problemUrls.get(url)?.push({
      timestamp: new Date(),
      type,
      details
    });
  }

  /**
   * Log a successful URL for comparison with problematic ones
   */
  logSuccessfulUrl(url: string, fieldsCount: number, details: any = {}) {
    if (!this.successfulUrls.has(url)) {
      this.successfulUrls.set(url, []);
    }
    this.successfulUrls.get(url)?.push({
      timestamp: new Date(),
      fields: fieldsCount,
      details
    });
  }

  /**
   * Analyze patterns in problematic URLs to identify common traits
   * This helps understand if specific types of job listings are more problematic
   */
  private analyzeUrlPatterns() {
    const analysis = {
      problemTypes: {} as Record<string, number>,
      commonPatterns: {} as Record<string, number>,
      hourlyDistribution: {} as Record<number, number>,
      fieldsCountDistribution: {
        problematic: {} as Record<number, number>,
        successful: {} as Record<number, number>
      }
    };

    // Analyze problem types
    this.problemUrls.forEach((events) => {
      events.forEach(event => {
        const { type } = event;
        analysis.problemTypes[type] = (analysis.problemTypes[type] || 0) + 1;
        
        // Analyze time patterns
        const hour = event.timestamp.getHours();
        analysis.hourlyDistribution[hour] = (analysis.hourlyDistribution[hour] || 0) + 1;
        
        // Look for common URL patterns
        const url = event.details.url || '';
        if (url) {
          [
            // Industry identifiers
            /\b(tech|software|developer|engineer|developer|it)\b/i,
            // Company size identifiers
            /\b(startup|enterprise|corporate)\b/i,
            // Location identifiers
            /\b(remote|onsite|hybrid)\b/i,
          ].forEach(pattern => {
            const match = url.match(pattern);
            if (match) {
              const key = match[0].toLowerCase();
              analysis.commonPatterns[key] = (analysis.commonPatterns[key] || 0) + 1;
            }
          });
        }

        // Fields count distribution for problematic URLs
        const fieldsCount = event.details.fieldsCount || 0;
        if (fieldsCount) {
          analysis.fieldsCountDistribution.problematic[fieldsCount] = 
            (analysis.fieldsCountDistribution.problematic[fieldsCount] || 0) + 1;
        }
      });
    });

    // Fields count distribution for successful URLs
    this.successfulUrls.forEach((events) => {
      events.forEach(event => {
        const { fields } = event;
        analysis.fieldsCountDistribution.successful[fields] = 
          (analysis.fieldsCountDistribution.successful[fields] || 0) + 1;
      });
    });

    return analysis;
  }

  /**
   * Get statistics on problematic vs successful URLs
   * Can be used to analyze patterns in failures
   */
  getApplicationStatistics() {
    const totalProblemUrls = this.problemUrls.size;
    const totalSuccessfulUrls = this.successfulUrls.size;
    
    // Convert Maps to plain objects for JSON serialization
    const problemUrlsObj: Record<string, any> = {};
    this.problemUrls.forEach((events, url) => {
      problemUrlsObj[url] = events.map(e => ({
        timestamp: e.timestamp.toISOString(),
        type: e.type,
        details: e.details
      }));
    });
    
    const successfulUrlsObj: Record<string, any> = {};
    this.successfulUrls.forEach((events, url) => {
      successfulUrlsObj[url] = events.map(e => ({
        timestamp: e.timestamp.toISOString(),
        fields: e.fields,
        details: e.details
      }));
    });
    
    // Generate the pattern analysis
    const patterns = this.analyzeUrlPatterns();
    
    return {
      summary: {
        total: {
          problemUrls: totalProblemUrls,
          successfulUrls: totalSuccessfulUrls,
          ratio: totalSuccessfulUrls / (totalProblemUrls + totalSuccessfulUrls)
        },
        totalEvents: {
          problem: Array.from(this.problemUrls.values()).reduce((sum, events) => sum + events.length, 0),
          successful: Array.from(this.successfulUrls.values()).reduce((sum, events) => sum + events.length, 0)
        }
      },
      patterns,
      problemUrls: problemUrlsObj,
      successfulUrls: successfulUrlsObj
    };
  }

  /**
   * Initialize a new search state for a user profile
   * This prioritizes the most relevant job searches first
   */
  private initializeSearchState(
    userId: number,
    searchUrls: { url: string; priority: number }[] = [],
    params: WorkableSearchParams = {}
  ): SearchState {
    return {
      userId,
      searchUrls,
      processedUrls: [],
      currentUrlIndex: 0,
      totalJobsFound: 0,
      jobIds: new Set<string>(),
      createdAt: new Date(),
      lastExecuted: new Date()
    };
  }

  /**
   * Save search state and return a token that can be used to retrieve it later
   */
  private async saveSearchState(state: SearchState): Promise<string> {
    const token = `search_${state.userId}_${Date.now()}`;
    this.searchStates.set(token, state);
    this.cleanupOldSearchStates();
    return token;
  }

  /**
   * Retrieve a search state by token
   */
  private async getSearchState(token: string): Promise<SearchState | null> {
    const state = this.searchStates.get(token);
    if (!state) return null;
    
    // Update last accessed time
    state.lastAccessed = new Date();
    return state;
  }

  /**
   * Remove search states older than 24 hours or completed ones
   */
  private cleanupOldSearchStates(): void {
    const now = new Date();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    
    this.searchStates.forEach((state, token) => {
      const age = now.getTime() - state.createdAt.getTime();
      const isComplete = state.searchUrls.length === 0 || 
        state.searchUrls.every(url => state.processedUrls.includes(url.url));
      
      if (age > ONE_DAY || isComplete) {
        this.searchStates.delete(token);
      }
    });
  }

  /**
   * Construct a Workable job search URL based on user profile and search parameters
   */
  buildSearchUrl(profile: UserProfile | null, params: WorkableSearchParams = {}): string {
    const urlObj = new URL(this.BASE_URL);
    
    // Default parameters
    const defaultParams: WorkableSearchParams = {
      query: '',
      days: 30, // Increased from 14 days to 30 days
      workplace: 'any',
      page: 1
    };
    
    // Combine default params with provided params
    const combinedParams = { ...defaultParams, ...params };
    
    // Add user profile data if available
    if (profile) {
      if (!combinedParams.query && profile.desiredRoles?.length) {
        combinedParams.query = profile.desiredRoles[0];
      }
      
      if (!combinedParams.location && profile.location) {
        combinedParams.location = profile.location;
      }
      
      // Update workplace logic: prefer user's remote preference
      if (profile.preferences?.remoteOnly) {
        combinedParams.workplace = 'remote';
      } else if (profile.preferences?.hybridOnly) {
        combinedParams.workplace = 'hybrid';
      } 
      // Only use 'any' if neither remote nor hybrid is set
      else if (!combinedParams.workplace) {
        combinedParams.workplace = 'any';
      }
    }
    
    // Map our parameters to Workable's expected URL parameters
    if (combinedParams.query) {
      urlObj.searchParams.set('query', combinedParams.query);
    }
    
    // Handle location (appended to query, not its own parameter)
    if (combinedParams.location) {
      // Workable doesn't use 'where' parameter, location is combined with query
      const existingQuery = urlObj.searchParams.get('query') || '';
      const locationQuery = combinedParams.location.trim();
      
      if (existingQuery) {
        // Append location to existing query with 'in' keyword
        urlObj.searchParams.set('query', `${existingQuery} in ${locationQuery}`);
      } else {
        // Just set location as the query
        urlObj.searchParams.set('query', locationQuery);
      }
    }
    
    // Workplace parameter now takes priority over remote
    if (combinedParams.workplace) {
      urlObj.searchParams.set('workspace', combinedParams.workplace); 
    } else if (combinedParams.remote) {
      urlObj.searchParams.set('workspace', 'remote');
    }
    
    // Map 'days' to Workable's 'day_range' parameter
    if (combinedParams.days) {
      if (combinedParams.days === 'all') {
        // Don't set any day_range for 'all'
      } else {
        urlObj.searchParams.set('day_range', combinedParams.days.toString());
      }
    }
    
    // Add page parameter
    if (combinedParams.page && combinedParams.page > 1) {
      urlObj.searchParams.set('page', combinedParams.page.toString());
    }
    
    return urlObj.toString();
  }

  /**
   * Generate initial search URLs for a user profile
   * This creates multiple searches based on user's desired roles
   * Returns string URLs that will be converted to {url, priority} objects
   */
  generateSearchUrls(profile: UserProfile | null, maxPages: number = 3, params: WorkableSearchParams = {}): string[] {
    const urls: string[] = [];
    
    if (!profile) {
      // Default search for users without profiles
      const url = this.buildSearchUrl(null, {
        ...params,
        query: 'software developer',
        workplace: 'any'
      });
      urls.push(url);
      return urls;
    }
    
    // Create searches for each desired role
    if (profile.desiredRoles?.length) {
      // Use each desired role for a separate search
      profile.desiredRoles.forEach(role => {
        const url = this.buildSearchUrl(profile, {
          ...params,
          query: role,
        });
        urls.push(url);
      });
    } else {
      // Fallback for users without desired roles
      const url = this.buildSearchUrl(profile, params);
      urls.push(url);
    }
    
    // Add pagination URLs if requested
    if (maxPages > 1) {
      const paginatedUrls: string[] = [];
      urls.forEach(baseUrl => {
        // Start from page 2 since page 1 is already included
        for (let i = 2; i <= maxPages; i++) {
          const urlObj = new URL(baseUrl);
          urlObj.searchParams.set('page', i.toString());
          paginatedUrls.push(urlObj.toString());
        }
      });
      urls.push(...paginatedUrls);
    }
    
    return urls;
  }

  /**
   * Fetch a Workable job page HTML directly and parse job details
   */
  async fetchJobDetails(url: string): Promise<WorkableJob | null> {
    try {
      // Validate URL format
      if (!this.isValidWorkableJobUrl(url)) {
        console.error(`Invalid Workable job URL format: ${url}`);
        return null;
      }
      
      const response = await this.limiter.schedule(() => fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': 'https://jobs.workable.com/'
        }
      }));
      
      if (!response.ok) {
        console.error(`Failed to fetch job details: ${response.statusText}`);
        return null;
      }
      
      const html = await response.text();
      return await this.extractJobInfoFromPage(url, html);
    } catch (error) {
      console.error(`Error fetching job details for ${url}:`, error);
      return null;
    }
  }

  /**
   * Fetch Workable job details with a cancellable timeout.
   * @param url The URL of the job detail page.
   * @param timeoutMs Timeout duration in milliseconds.
   * @returns WorkableJob or null if fetch fails or times out.
   */
  async fetchJobDetailsWithTimeout(url: string, timeoutMs: number = 10000): Promise<WorkableJob | null> {
    return new Promise(async (resolve) => {
      // Set timeout
      const timeout = setTimeout(() => {
        console.error(`Timeout fetching job details for ${url}`);
        resolve(null);
      }, timeoutMs);
      
      try {
        const job = await this.fetchJobDetails(url);
        clearTimeout(timeout);
        resolve(job);
      } catch (error) {
        console.error(`Error fetching job details for ${url}:`, error);
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  /**
   * Checks if a URL is a valid Workable job posting URL
   * This looks for the jobs.workable.com/view pattern which shows the job listing
   * where users can click "Apply now"
   */
  isValidWorkableJobUrl(url: string): boolean {
    return /^https?:\/\/(?:jobs\.workable\.com\/view\/|apply\.workable\.com\/[^\/]+\/j\/)[A-Za-z0-9]+/i.test(url);
  }

  /**
   * Checks if a URL is a valid Workable application URL
   * We specifically look for several patterns:
   * 1. jobs.workable.com/view/JOBID - The job posting page
   * 2. apply.workable.com/company/j/JOBID - Direct application URL
   * 3. *.workable.com/j/JOBID - Another application URL format
   * 
   * For our purposes, we accept both job posting URLs and application URLs 
   * since we can navigate from one to the other.
   */
  isValidWorkableApplicationUrl(url: string): boolean {
    // Matches various Workable URL patterns
    return (
      /^https?:\/\/jobs\.workable\.com\/view\/[A-Za-z0-9]+/i.test(url) ||
      /^https?:\/\/apply\.workable\.com\/[^\/]+\/j\/[A-Za-z0-9]+/i.test(url) ||
      /^https?:\/\/[^\.]+\.workable\.com\/j\/[A-Za-z0-9]+/i.test(url)
    );
  }

  /**
   * Introspect a Workable job application form to discover its field schema
   * This uses the Playwright Worker's /introspect endpoint to analyze the form
   * 
   * @param jobUrl The URL of the Workable job posting
   * @returns The field schema of the application form or null if introspection failed
   */
  async introspectJobForm(jobUrl: string): Promise<any> {
    try {
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL;
      if (!workerUrl) {
        console.error("No Playwright worker URL configured");
        return null;
      }

      const completeWorkerUrl = workerUrl.startsWith('http') 
        ? workerUrl 
        : `https://${workerUrl}`;
        
      // Only target Workable application forms
      if (!this.isValidWorkableApplicationUrl(jobUrl)) {
        console.error(`Not a valid Workable application URL: ${jobUrl}`);
        return null;
      }

      // Use introspect endpoint with Workable-specific parameters
      const response = await this.limiter.schedule(() =>
        fetch(`${completeWorkerUrl}/introspect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: jobUrl,
            target: 'workable',
            config: {
              waitForSelector: '#whr-app-form', // Standard Workable app form container
              analyzeFields: true,
              captureFormState: true
            }
          })
        })
      );

      if (!response.ok) {
        console.error(`Form introspection failed: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error introspecting job form:`, error);
      return null;
    }
  }

  /**
   * Scrape job listings from a Workable search URL, with rate limiting and priority-based pagination
   * 
   * @param searchUrl The URL of the search results page
   * @param state Optional search state for tracking duplicates and pagination
   * @param jobDetailTimeoutMs Timeout for each job detail fetch operation
   * @returns Array of job listings found on the page
   */
  async scrapeJobsFromSearchUrl(
    searchUrl: string,
    state?: SearchState,
    jobDetailTimeoutMs: number = 10000
  ): Promise<JobListing[]> {
    try {
      const urlObj = new URL(searchUrl);
      const query = urlObj.searchParams.get('query') || '';
      console.log(`Fetching job listings from: ${searchUrl}`);

      // Use Playwright worker to scroll and extract job links
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL;
      if (!workerUrl) {
        console.error('No Playwright worker URL configured');
        return [];
      }
      const completeWorkerUrl = workerUrl.startsWith('http') ? workerUrl : `https://${workerUrl}`;
      const payload = {
        url: searchUrl,
        scroll: true,
        maxScrolls: 50,
      };
      const response = await this.limiter.schedule(() =>
        fetch(`${completeWorkerUrl}/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '10', 10);
          console.warn(`Rate limited (429) when fetching ${searchUrl}. Queuing for retry after ${retryAfter}s`);
          this.logProblemUrl(searchUrl, 'rate_limited_429', { timestamp: new Date().toISOString(), retryAfter });
          if (state) {
            const rateLimitKey = `rate_limit_${query}`;
            const attempts = (state[rateLimitKey] || 0) + 1;
            state[rateLimitKey] = attempts;
            const backoffPriority = Math.max(0.05, 0.5 / Math.pow(2, attempts));
            setTimeout(() => {
              state.searchUrls.push({ url: searchUrl, priority: backoffPriority });
              console.log(`Re-queued rate-limited URL with priority ${backoffPriority.toFixed(3)} (attempt ${attempts})`);
            }, retryAfter * 1000);
          }
          return [];
        }
        console.error(`Failed to fetch: ${response.statusText}, Status: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const jobLinks: string[] = data.jobLinks || [];
      const totalJobsOnPage = jobLinks.length;
      console.log(`Found ${totalJobsOnPage} unique job links for query "${query}" via infinite scrolling`);

      let newLinks = state
        ? jobLinks.filter(link => {
            const potentialId = link.split('/').pop();
            return potentialId && !state.jobIds.has(potentialId);
          })
        : jobLinks;
      const newJobsFound = newLinks.length;
      const duplicateJobsFound = totalJobsOnPage - newJobsFound;

      const MAX_JOBS_PER_PAGE = 20;
      const jobsToProcess = newLinks.slice(0, MAX_JOBS_PER_PAGE);

      const detailFetchPromises = jobsToProcess.map(jobLink =>
        this.limiter.schedule(() =>
          this.fetchJobDetailsWithTimeout(jobLink, jobDetailTimeoutMs).then(detail => ({ link: jobLink, detail }))
        )
      );
      const results = await Promise.allSettled(detailFetchPromises);

      const jobListings: JobListing[] = [];
      let successfulDetailsCount = 0;

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.detail) {
          const { link, detail } = result.value;
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
      });

      console.log(`Successfully fetched ${successfulDetailsCount}/${jobsToProcess.length} job details from ${searchUrl}`);
      console.log(`Found ${jobListings.length} jobs from ${searchUrl}, added ${jobListings.length} to results`);

      if (state) {
        state.processedUrls.push(searchUrl);
        state.totalJobsFound += jobListings.length;

        const effectivenessScore = totalJobsOnPage > 0 ? newJobsFound / totalJobsOnPage : 0;
        const avgMatchScore = jobListings.length > 0
          ? jobListings.reduce((sum, job) => sum + (job.matchScore || 70), 0) / jobListings.length
          : 70;
        const queryEffectivenessKey = `effectiveness_${query}`;
        const previousEffectiveness = state[queryEffectivenessKey] || 0;
        const alpha = 0.3;
        state[queryEffectivenessKey] = previousEffectiveness * (1 - alpha) + effectivenessScore * alpha;

        if (jobListings.length === 0) {
          console.log(`No new jobs for query "${query}". Stopping scroll.`);
        }
      }

      return jobListings;
    } catch (error) {
      console.error(`Error scraping ${searchUrl}:`, error);
      if (state) {
        const errorKey = `error_count_${searchUrl}`;
        const errorCount = (state[errorKey] || 0) + 1;
        state[errorKey] = errorCount;
        if (errorCount <= 3) {
          const backoffDelay = Math.pow(2, errorCount) * 1000;
          const retryPriority = Math.max(0.05, 0.3 / errorCount);
          setTimeout(() => {
            state.searchUrls.push({ url: searchUrl, priority: retryPriority });
            console.log(`Re-queued failed URL with priority ${retryPriority.toFixed(2)} after ${backoffDelay}ms (attempt ${errorCount})`);
          }, backoffDelay);
        } else {
          state.processedUrls.push(searchUrl);
          console.log(`URL failed ${errorCount} times, not retrying: ${searchUrl}`);
        }
      }
      return [];
    }
  }

  /**
   * Extract job information from a job page
   * @param jobUrl The URL of the job page
   * @param html The HTML content of the page (optional)
   * @returns Job information object or null if extraction failed
   */
  async extractJobInfoFromPage(jobUrl: string, pageHtml?: string): Promise<{
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    source: 'workable';
    appliedAt: null;
    status: 'found';
  } | null> {
    try {
      // This will run asynchronously only if pageHtml is not provided
      let html = pageHtml;
      if (!html) {
        const response = await fetch(jobUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          }
        });
        
        if (!response.ok) {
          console.error(`Failed to fetch job page: ${response.statusText}`);
          return null;
        }
        
        html = await response.text();
      }
      
      const $ = cheerio.load(html);
      
      // Extract job information from the HTML
      let title = $('.job-detail-title .brand-font h1').text().trim();
      if (!title) {
        title = $('h1.job-title, h1[data-ui="job-title"]').text().trim();
      }
      
      let company = $('.company-name').text().trim();
      if (!company) {
        company = $('a[data-ui="company-name"]').text().trim();
      }
      
      let location = $('.job-detail-location').text().trim();
      if (!location) {
        location = $('.location').text().trim();
      }
      
      // Extract description with fallbacks
      let description = '';
      const descriptionElement = $('.job-description') || $('#job-description') || $('div[data-ui="job-description"]');
      
      if (descriptionElement.length) {
        description = descriptionElement.text().trim();
      } else {
        // Fallback: try to get content from main content area
        const contentArea = $('.main-content-area'); 
        if (contentArea.length) {
          contentArea.find('h1, .job-locations, .job-actions, script, style').remove();
          description = contentArea.text().trim();
        }
      }
      
      // Validate extraction results
      if (!title || !description) {
        console.error(`Failed to extract job information from ${jobUrl}. Missing critical fields.`);
        return null;
      }
      
      return {
        title,
        company: company || 'Unknown Company',
        location: location || 'Location not specified',
        description,
        url: jobUrl,
        source: 'workable',
        appliedAt: null,
        status: 'found'
      };
    } catch (error) {
      console.error(`Error extracting job info from ${jobUrl}:`, error);
      return null;
    }
  }

  /**
   * Calculate an initial match score for a job
   * @param jobInfo Job information to calculate a match score for
   * @returns Match score between 0-100
   */
  calculateInitialMatchScore(jobInfo: {
    title: string;
    company: string;
    description: string;
    location: string;
  }): number {
    // This is a simplified scoring algorithm based on job details
    // More sophisticated matching will be done by the AI service
    
    // Basic factors:
    // - Job title relevance (based on user's desired roles)
    // - Location match
    // - Job description keyword matches
    
    // For the scraper, we'll use a simple algorithm that gives higher scores to:
    // - Software engineering/development roles
    // - Roles with modern tech stacks
    // - Roles that mention remote work
    
    const { title, company, description, location } = jobInfo;
    
    // Start with a base score
    let score = 50;
    
    // Boost for software roles
    const softwareRoleKeywords = [
      'software', 'developer', 'engineer', 'web', 'full stack', 'fullstack', 
      'frontend', 'backend', 'front-end', 'back-end', 'javascript', 'react', 
      'node', 'typescript'
    ];
    
    // Check for keywords in title and description
    const titleLower = title.toLowerCase();
    const descriptionLower = description.toLowerCase();
    const locationLower = location.toLowerCase();
    
    // Role relevance (30 points max)
    const titleMatches = softwareRoleKeywords.filter(kw => titleLower.includes(kw)).length;
    score += Math.min(20, titleMatches * 5);
    
    // Tech stack modernity (20 points max)
    const modernTechKeywords = [
      'react', 'node', 'typescript', 'aws', 'cloud', 'kubernetes', 'docker',
      'microservices', 'graphql', 'vue', 'angular', 'next.js', 'serverless'
    ];
    
    const techMatches = modernTechKeywords.filter(kw => descriptionLower.includes(kw)).length;
    score += Math.min(15, techMatches * 3);
    
    // Remote work bonus (15 points max)
    if (locationLower.includes('remote') || descriptionLower.includes('remote')) {
      score += 15;
    } else if (locationLower.includes('hybrid') || descriptionLower.includes('hybrid')) {
      score += 10;
    }
    
    // Company recognition (10 points max)
    const knownCompanies = [
      'google', 'microsoft', 'amazon', 'apple', 'facebook', 'meta', 'netflix',
      'airbnb', 'stripe', 'uber', 'lyft', 'twitter', 'linkedin', 'adobe',
      'salesforce', 'github', 'gitlab', 'atlassian', 'shopify', 'slack'
    ];
    
    const companyLower = company.toLowerCase();
    const isKnownCompany = knownCompanies.some(c => companyLower.includes(c));
    
    if (isKnownCompany) {
      score += 10;
    }
    
    // Cap the score at 100
    return Math.min(100, Math.round(score));
  }

  /**
   * Deduplicate jobs by URL
   * @param jobs Array of job listings
   * @returns Array of unique job listings
   */
  deduplicateJobs(jobs: JobListing[]): JobListing[] {
    const uniqueJobs = new Map<string, JobListing>();
    
    jobs.forEach(job => {
      const key = job.applyUrl;
      if (!uniqueJobs.has(key)) {
        uniqueJobs.set(key, job);
      }
    });
    
    return Array.from(uniqueJobs.values());
  }

  /**
   * Execute a batched search based on the current search state
   * This allows us to fetch jobs in smaller batches for faster initial results
   * Uses priority queue for more intelligent job search ordering
   */
  async executeBatchedSearch(
    searchState: SearchState,
    options: {
      maxJobs?: number;
      maxSearches?: number;
      progressCallback?: (progress: any) => void;
    }
  ): Promise<{
    jobs: JobListing[];
    hasMore: boolean;
    nextSearchState: SearchState;
  }> {
    const { maxJobs = 50, maxSearches = 5, progressCallback } = options;
    
    // Make a copy of the search state to avoid modifying the original
    const stateCopy: SearchState = {
      ...searchState,
      searchUrls: [...searchState.searchUrls],
      processedUrls: [...searchState.processedUrls],
      jobIds: new Set([...searchState.jobIds]),
      lastExecuted: new Date()
    };
    
    const allJobs: JobListing[] = [];
    let searchesExecuted = 0;
    
    // Priority queue approach - sort URLs by priority and take the top ones
    // Higher priority values mean higher precedence
    stateCopy.searchUrls.sort((a, b) => b.priority - a.priority);
    
    while (
      stateCopy.searchUrls.length > 0 && 
      allJobs.length < maxJobs && 
      searchesExecuted < maxSearches
    ) {
      // Get the highest priority URL
      const { url, priority } = stateCopy.searchUrls.shift()!;
      
      // Skip if already processed
      if (stateCopy.processedUrls.includes(url)) {
        continue;
      }
      
      searchesExecuted++;
      
      // Report progress
      if (progressCallback) {
        progressCallback({
          searchesExecuted,
          totalSearchUrls: searchState.searchUrls.length,
          currentUrl: url,
          jobsFound: allJobs.length,
          searchState: stateCopy
        });
      }
      
      // Process this URL
      console.log(`[${searchesExecuted}/${maxSearches}] Processing URL with priority ${priority.toFixed(2)}: ${url}`);
      const jobs = await this.scrapeJobsFromSearchUrl(url, stateCopy);
      
      // Add to results
      allJobs.push(...jobs);
      
      // Update state
      stateCopy.processedUrls.push(url);
      
      // Stop if we've reached the limit
      if (allJobs.length >= maxJobs) {
        break;
      }
    }
    
    // Deduplicate jobs
    const uniqueJobs = this.deduplicateJobs(allJobs);
    
    return {
      jobs: uniqueJobs,
      hasMore: stateCopy.searchUrls.length > 0,
      nextSearchState: stateCopy
    };
  }

  /**
   * Get Workable jobs for a user based on their profile
   * This function is used by the auto-apply service
   * @param userId User ID to get jobs for
   * @param progressCallback Optional callback for tracking search progress
   * @param options Options for controlling the search behavior
   */
  async getWorkableJobsForUser(
    userId: number, 
    profile: UserProfile | null,
    progressCallback?: (progress: any) => void,
    options: {
      maxJobs?: number;
      maxSearches?: number;
      searchToken?: string;
      resetSearch?: boolean;
    } = {}
  ): Promise<{
    jobs: JobListing[];
    hasMore: boolean;
    searchToken: string;
  }> {
    const { maxJobs = 50, maxSearches = 5, searchToken, resetSearch = false } = options;
    
    // Either retrieve existing search state or create a new one
    let searchState: SearchState;
    
    if (searchToken && !resetSearch) {
      const existingState = await this.getSearchState(searchToken);
      if (existingState) {
        console.log(`Resuming search for user ${userId} with token ${searchToken}`);
        searchState = existingState;
      } else {
        console.log(`Search token ${searchToken} not found, creating new search state`);
        // Generate new search state
        const searchUrls = this.generateSearchUrls(profile)
          .map(url => ({ url, priority: 1.0 })); // Initial URLs all have equal priority
        
        searchState = this.initializeSearchState(userId, searchUrls);
      }
    } else {
      console.log(`Starting new search for user ${userId}`);
      // Generate new search state
      const searchUrls = this.generateSearchUrls(profile)
        .map(url => ({ url, priority: 1.0 })); // Initial URLs all have equal priority
      
      searchState = this.initializeSearchState(userId, searchUrls);
    }
    
    console.log(`Search state has ${searchState.searchUrls.length} URLs to process`);
    
    // If we have no URLs to search, add default ones
    if (searchState.searchUrls.length === 0) {
      if (profile) {
        // Try to regenerate based on profile
        const newUrls = this.generateSearchUrls(profile)
          .filter(url => !searchState.processedUrls.includes(url))
          .map(url => ({ url, priority: 0.8 })); // Slightly lower priority for regenerated URLs
        
        searchState.searchUrls.push(...newUrls);
      }
      
      // If still empty, add default searches
      if (searchState.searchUrls.length === 0) {
        console.log(`No search URLs available, adding default searches`);
        const defaultSearches = [
          'software developer',
          'web developer',
          'full stack developer',
          'frontend developer',
          'backend developer'
        ];
        
        const defaultUrls = defaultSearches.map(query => 
          this.buildSearchUrl(null, { query, workplace: 'any' })
        );
        
        searchState.searchUrls.push(
          ...defaultUrls
            .filter(url => !searchState.processedUrls.includes(url))
            .map(url => ({ url, priority: 0.5 })) // Lower priority for default searches
        );
      }
    }
    
    // Execute a batch of searches
    const { jobs, hasMore, nextSearchState } = await this.executeBatchedSearch(searchState, {
      maxJobs,
      maxSearches,
      progressCallback
    });
    
    // Save the updated search state
    const newSearchToken = await this.saveSearchState(nextSearchState);
    
    console.log(`Found ${jobs.length} jobs, has more: ${hasMore}, new search token: ${newSearchToken}`);
    
    return {
      jobs,
      hasMore,
      searchToken: newSearchToken
    };
  }

  /**
   * Fetch jobs from default searches when user has no profile
   * This provides a fallback for new users
   */
  private async fetchJobsFromDefaultSearches(): Promise<JobListing[]> {
    const defaultQueries = [
      'software developer',
      'web developer',
      'javascript developer'
    ];
    
    const allJobs: JobListing[] = [];
    
    for (const query of defaultQueries) {
      const searchUrl = this.buildSearchUrl(null, { query });
      const jobs = await this.scrapeJobsFromSearchUrl(searchUrl);
      allJobs.push(...jobs);
      
      // Limit total jobs
      if (allJobs.length >= 30) break;
    }
    
    return this.deduplicateJobs(allJobs).slice(0, 30);
  }
}

export const workableScraper = new WorkableScraper();

export const getWorkableJobsForUser = async (
  userId: number, 
  profile: UserProfile | null
): Promise<JobListing[]> => {
  const results = await workableScraper.getWorkableJobsForUser(userId, profile);
  return results.jobs;
};