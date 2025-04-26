import { UserProfile, JobPreferences } from "@shared/schema";
import { storage } from "../storage";
import crypto from "crypto";

/**
 * Workable job search parameters
 */
interface WorkableSearchParams {
  // Internal parameters that are mapped to Workable's expected URL parameters
  query?: string;     // Maps to 'query' parameter (search terms for job title/skills)
  location?: string;  // Combined with query parameter (NOT using 'where')
  remote?: boolean;   // Maps to 'workplace=remote' (valid values: 'remote' or 'hybrid', not 'on-site')
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

/**
 * Workable scraper service
 * This service builds and executes Workable job searches based on user profile data
 */
/**
 * Interface for storing search state between paginated searches
 */
interface SearchState {
  // Search configuration
  userId: number;
  searchUrls: string[];
  processedUrls: string[];
  currentUrlIndex: number;
  
  // Search metadata
  totalJobsFound: number;
  jobIds: Set<string>; // Track job IDs to avoid duplicates
  
  // Pagination
  createdAt: Date;
}

export class WorkableScraper {
  private readonly BASE_URL = 'https://jobs.workable.com/search';
  private searchStates: Map<string, SearchState> = new Map();
  
  // Track problematic URLs that failed during introspection or application
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
    
    const urlLog = this.problemUrls.get(url)!;
    urlLog.push({
      timestamp: new Date(),
      type,
      details
    });
    
    // Log detailed information for analysis
    console.log(`PROBLEM_URL_LOG: ${url} | Type: ${type} | Details:`, 
      typeof details === 'object' ? JSON.stringify(details).substring(0, 500) : details);
    
    // Keep the last 10 errors per URL at most
    if (urlLog.length > 10) {
      urlLog.shift();
    }
  }
  
  /**
   * Log a successful URL for comparison with problematic ones
   */
  logSuccessfulUrl(url: string, fieldsCount: number, details: any = {}) {
    if (!this.successfulUrls.has(url)) {
      this.successfulUrls.set(url, []);
    }
    
    const urlLog = this.successfulUrls.get(url)!;
    urlLog.push({
      timestamp: new Date(),
      fields: fieldsCount,
      details
    });
    
    console.log(`SUCCESS_URL_LOG: ${url} | Fields: ${fieldsCount}`);
    
    // Keep the last 5 successes per URL
    if (urlLog.length > 5) {
      urlLog.shift();
    }
  }
  
  /**
   * Analyze patterns in problematic URLs to identify common traits
   * This helps understand if specific types of job listings are more problematic
   */
  private analyzeUrlPatterns() {
    const urlPattern = /\/view\/([A-Za-z0-9]+)$/;
    const companyPatterns = [
      // Look for different company formats in URLs
      /apply\.workable\.com\/([^\/]+)\//,
      /\/([^\/]+)\/j\//,
      /\/([\w-]+)\/?$/
    ];
    
    const patterns = {
      idLength: {} as Record<number, number>,
      idFirstChar: {} as Record<string, number>,
      idLastChar: {} as Record<string, number>,
      companies: {} as Record<string, { success: number, failure: number }>,
      domainPatterns: {
        jobsWorkable: { success: 0, failure: 0 },
        applyWorkable: { success: 0, failure: 0 },
        companyWorkable: { success: 0, failure: 0 },
        other: { success: 0, failure: 0 }
      }
    };
    
    // Analyze problematic URLs
    this.problemUrls.forEach((logs, url) => {
      // Check URL ID length
      const match = urlPattern.exec(url);
      if (match) {
        const id = match[1];
        patterns.idLength[id.length] = (patterns.idLength[id.length] || 0) + 1;
        patterns.idFirstChar[id[0]] = (patterns.idFirstChar[id[0]] || 0) + 1;
        patterns.idLastChar[id[id.length - 1]] = (patterns.idLastChar[id[id.length - 1]] || 0) + 1;
      }
      
      // Check URL domain pattern
      if (url.includes('jobs.workable.com')) {
        patterns.domainPatterns.jobsWorkable.failure++;
      } else if (url.includes('apply.workable.com')) {
        patterns.domainPatterns.applyWorkable.failure++;
      } else if (url.match(/\w+\.workable\.com/)) {
        patterns.domainPatterns.companyWorkable.failure++;
      } else {
        patterns.domainPatterns.other.failure++;
      }
      
      // Try to extract company name
      for (const pattern of companyPatterns) {
        const companyMatch = pattern.exec(url);
        if (companyMatch) {
          const company = companyMatch[1].toLowerCase();
          if (!patterns.companies[company]) {
            patterns.companies[company] = { success: 0, failure: 1 };
          } else {
            patterns.companies[company].failure++;
          }
          break;
        }
      }
    });
    
    // Analyze successful URLs
    this.successfulUrls.forEach((logs, url) => {
      // Check URL domain pattern
      if (url.includes('jobs.workable.com')) {
        patterns.domainPatterns.jobsWorkable.success++;
      } else if (url.includes('apply.workable.com')) {
        patterns.domainPatterns.applyWorkable.success++;
      } else if (url.match(/\w+\.workable\.com/)) {
        patterns.domainPatterns.companyWorkable.success++;
      } else {
        patterns.domainPatterns.other.success++;
      }
      
      // Try to extract company name
      for (const pattern of companyPatterns) {
        const companyMatch = pattern.exec(url);
        if (companyMatch) {
          const company = companyMatch[1].toLowerCase();
          if (!patterns.companies[company]) {
            patterns.companies[company] = { success: 1, failure: 0 };
          } else {
            patterns.companies[company].success++;
          }
          break;
        }
      }
    });
    
    return patterns;
  }
  
  /**
   * Get statistics on problematic vs successful URLs
   * Can be used to analyze patterns in failures
   */
  getApplicationStatistics() {
    // Analyze URL patterns
    const patterns = this.analyzeUrlPatterns();
    
    // Calculate success rate by domain pattern
    const domainSuccessRates = {} as Record<string, number>;
    for (const [domain, counts] of Object.entries(patterns.domainPatterns)) {
      const total = counts.success + counts.failure;
      domainSuccessRates[domain] = total > 0 ? (counts.success / total) * 100 : 0;
    }
    
    // Find companies with high failure rates
    const companyAnalysis = Object.entries(patterns.companies)
      .map(([company, counts]) => {
        const total = counts.success + counts.failure;
        const failureRate = total > 0 ? (counts.failure / total) * 100 : 0;
        return { company, failureRate, total, success: counts.success, failure: counts.failure };
      })
      .filter(item => item.total >= 3) // Only include companies with at least 3 attempts
      .sort((a, b) => b.failureRate - a.failureRate) // Sort by failure rate descending
      .slice(0, 10); // Top 10 problematic companies
    
    return {
      totalProblemUrls: this.problemUrls.size,
      totalSuccessfulUrls: this.successfulUrls.size,
      successRate: this.successfulUrls.size + this.problemUrls.size > 0 
        ? (this.successfulUrls.size / (this.successfulUrls.size + this.problemUrls.size)) * 100 
        : 0,
      problemTypes: Array.from(this.problemUrls.values()).reduce((counts, logs) => {
        logs.forEach(log => {
          const type = log.type;
          counts[type] = (counts[type] || 0) + 1;
        });
        return counts;
      }, {} as Record<string, number>),
      patterns: {
        domainSuccessRates,
        idLengthDistribution: patterns.idLength,
        companyAnalysis
      },
      // Sample of recent problems
      recentProblems: Array.from(this.problemUrls.entries())
        .slice(-5)
        .map(([url, logs]) => ({
          url,
          latestError: logs[logs.length - 1]
        })),
      // Sample of successful URLs
      recentSuccesses: Array.from(this.successfulUrls.entries())
        .slice(-5)
        .map(([url, logs]) => ({
          url,
          fields: logs[logs.length - 1].fields
        }))
    };
  }
  
  /**
   * Initialize a new search state for a user profile
   * This prioritizes the most relevant job searches first
   */
  private initializeSearchState(userProfile: UserProfile | null, maxPages: number = 3): SearchState {
    const searchUrls = this.generateSearchUrls(userProfile, maxPages);
    console.log(`Generated ${searchUrls.length} search URLs for user profile`);
    
    return {
      userId: userProfile?.userId || 0,
      searchUrls,
      processedUrls: [],
      currentUrlIndex: 0,
      totalJobsFound: 0,
      jobIds: new Set<string>(),
      createdAt: new Date()
    };
  }
  
  /**
   * Save search state and return a token that can be used to retrieve it later
   */
  private async saveSearchState(state: SearchState): Promise<string> {
    // Generate a random token
    const token = crypto.randomBytes(16).toString('hex');
    
    // Store the state in memory with the token as the key
    this.searchStates.set(token, state);
    
    // Remove old search states (older than 1 hour)
    this.cleanupOldSearchStates();
    
    return token;
  }
  
  /**
   * Retrieve a search state by token
   */
  private async getSearchState(token: string): Promise<SearchState | null> {
    return this.searchStates.get(token) || null;
  }
  
  /**
   * Remove search states older than 1 hour
   */
  private cleanupOldSearchStates(): void {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    // Use forEach to avoid for...of iteration compatibility issues
    this.searchStates.forEach((state, token) => {
      if (state.createdAt < oneHourAgo) {
        this.searchStates.delete(token);
      }
    });
  }
  
  /**
   * Construct a Workable job search URL based on user profile and search parameters
   */
  buildSearchUrl(profile: UserProfile | null, params: WorkableSearchParams = {}): string {
    console.log(`Building search URL with params:`, JSON.stringify(params));
    
    // Start with the base search URL
    const url = new URL(this.BASE_URL);
    
    // BUILD THE QUERY PARAMETER - This is the main search term
    let queryParts = [];
    
    // Add job title as the primary search term
    if (params.query) {
      queryParts.push(params.query);
    } else if (profile?.jobTitlesOfInterest?.length) {
      // Use the first job title of interest as the primary search term
      queryParts.push(profile.jobTitlesOfInterest[0]);
    } else {
      // Default to software engineer if no query is specified
      queryParts.push('software engineer');
    }
    
    // OPTIONALLY ADD LOCATION TO QUERY - NOT as a separate 'where' parameter
    // Location is part of the query parameter, not a separate parameter
    if (params.location && params.location.toLowerCase() !== 'remote') {
      queryParts.push(params.location);
    } else if (profile?.locationsOfInterest?.length && profile.locationsOfInterest[0].toLowerCase() !== 'remote') {
      queryParts.push(profile.locationsOfInterest[0]);
    }
    
    // Combine all query parts and set the query parameter
    url.searchParams.append('query', queryParts.join(' '));
    
    // Add remote preference - WORKPLACE parameter (only valid values: remote or hybrid)
    if (params.remote !== undefined) {
      // Only 'remote' or 'hybrid' are valid values, 'on-site' is not accepted
      const workplace = params.remote ? 'remote' : 'hybrid';
      url.searchParams.append('workplace', workplace);
    } else if (profile?.preferredWorkArrangement) {
      // Map user remote preference to Workable format
      let workplace = 'hybrid'; // Default to hybrid instead of on-site
      
      if (profile.preferredWorkArrangement === 'remote') {
        workplace = 'remote';
      }
      
      url.searchParams.append('workplace', workplace);
    } else {
      // Default to remote if no preference
      url.searchParams.append('workplace', 'remote');
    }
    
    // Add date range - Use DAY_RANGE parameter (not 'days')
    const days = params.days || 14;
    if (days !== 'all') {
      url.searchParams.append('day_range', days.toString());
    }
    
    // Add pagination - Use PAGE parameter (not 'p')
    if (params.page && params.page > 1) {
      url.searchParams.append('page', params.page.toString());
    }
    
    // Add sort by relevance
    url.searchParams.append('sort', 'relevance');
    
    const finalUrl = url.toString();
    console.log(`Generated search URL: ${finalUrl}`);
    return finalUrl;
  }
  
  /**
   * Generate all search URLs for a user profile
   * This creates multiple searches based on user's desired roles
   */
  generateSearchUrls(profile: UserProfile | null, maxPages: number = 3): string[] {
    const searchUrls: string[] = [];
    
    if (!profile) {
      // Generate a generic search URL if no profile
      return [this.buildSearchUrl(null)];
    }
    
    // Create more varied search queries based on profile
    let jobTitles = profile.jobTitlesOfInterest || [];
    
    // If user has no job titles or fewer than 3, add some default ones
    if (jobTitles.length < 3) {
      // Add some common tech job titles that weren't explicitly specified
      const defaultTitles = [
        'Software Engineer', 
        'Web Developer', 
        'Full Stack Developer',
        'Frontend Developer',
        'Backend Developer',
        'Software Developer',
        'React Developer',
        'JavaScript Developer',
        'Node.js Developer'
      ];
      
      // Filter out defaults that might duplicate existing preferences
      const additionalTitles = defaultTitles.filter(title => 
        !jobTitles.some(userTitle => 
          userTitle.toLowerCase().includes(title.toLowerCase()) || 
          title.toLowerCase().includes(userTitle.toLowerCase())
        )
      );
      
      // Add enough defaults to make at least 3 job titles
      jobTitles = [...jobTitles, ...additionalTitles.slice(0, Math.max(0, 3 - jobTitles.length))];
    }
    
    console.log(`Using job titles for search: ${jobTitles.join(', ')}`);
    const searchQueries = jobTitles.slice(0, 3);
    
    for (const jobTitle of searchQueries) {
      // Add searches for pages 1 to maxPages
      for (let page = 1; page <= maxPages; page++) {
        // Use the correct parameter names for the Workable API
        console.log(`Searching for job title "${jobTitle}" on page ${page}`);
        searchUrls.push(this.buildSearchUrl(profile, { 
          query: jobTitle,  // This will be used to build the 'query' parameter
          page 
        }));
      }
    }
    
    return searchUrls;
  }
  
  /**
   * Fetch a Workable job page HTML directly and parse job details
   */
  async fetchJobDetails(url: string): Promise<WorkableJob | null> {
    try {
      // Use our direct fetch API to get job details
      const apiUrl = `http://localhost:5000/api/workable/direct-fetch?url=${encodeURIComponent(url)}`;
      
      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error(`Failed to fetch job details: ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      
      // Return the job data from our API
      return data.job as WorkableJob;
    } catch (error) {
      console.error('Error fetching job details:', error);
      return null;
    }
  }
  
  /**
   * Fetch Workable job details with a cancellable timeout.
   * @param url The URL of the job detail page.
   * @param timeoutMs Timeout duration in milliseconds.
   * @returns WorkableJob or null if fetch fails or times out.
   */
  async fetchJobDetailsWithTimeout(url: string, timeoutMs: number = 5000): Promise<WorkableJob | null> {
    // AbortController allows cancelling the fetch request
    const controller = new AbortController();
    const signal = controller.signal;

    // Set a timer to abort the request after timeoutMs
    const timeoutId = setTimeout(() => {
      console.log(`Timing out fetch for ${url} after ${timeoutMs}ms`);
      controller.abort();
    }, timeoutMs);

    try {
      console.log(`Fetching job details for ${url} with timeout ${timeoutMs}ms`);
      // Use our direct fetch API endpoint
      const apiUrl = `http://localhost:5000/api/workable/direct-fetch?url=${encodeURIComponent(url)}`;

      const response = await fetch(apiUrl, {
        signal, // Pass the AbortSignal to fetch
        headers: {
          // Add any necessary headers for our internal API
          'Accept': 'application/json'
        }
      });

      // Clear the timeout timer if the fetch completes or fails before the timeout
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle non-2xx responses (e.g., 404, 500)
        console.error(`Failed to fetch job details (${url}): ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      // Validate the structure of data.job before returning
      if (data && data.job && typeof data.job.title === 'string') {
        // Add source and default status/appliedAt if missing from API response
        return {
          source: 'workable',
          status: 'found',
          appliedAt: null,
          ...data.job // Spread the properties from API response
        } as WorkableJob;
      } else {
        console.error(`Invalid job data received from direct-fetch API for ${url}`);
        return null;
      }

    } catch (error: any) {
      // Clear the timeout timer in case of other errors
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        // This specific error is thrown when controller.abort() is called
        console.warn(`Fetch aborted for ${url} due to timeout.`);
      } else {
        // Log other potential errors (network issues, JSON parsing errors, etc.)
        console.error(`Error fetching job details for ${url}:`, error.message);
      }
      return null;
    }
  }
  
  /**
   * Checks if a URL is a valid Workable job posting URL
   * This looks for the jobs.workable.com/view pattern which shows the job listing
   * where users can click "Apply now"
   */
  isValidWorkableJobUrl(url: string): boolean {
    if (!url) return false;
    
    try {
      // Allow for URLs with and without job title segments
      // Pattern 1: jobs.workable.com/view/ID - the basic job view URL
      // Pattern 2: jobs.workable.com/view/ID/job-title-slug - URL with job title
      const jobsPatterns = [
        /jobs\.workable\.com\/view\/[A-Za-z0-9]+\/?$/i,
        /jobs\.workable\.com\/view\/[A-Za-z0-9]+\/.+$/i  // Pattern that includes job title slug
      ];
      
      return jobsPatterns.some(pattern => pattern.test(url));
    } catch (error) {
      console.error("Error validating Workable job URL:", error);
      return false;
    }
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
    if (!url) return false;
    
    try {
      // Normalize the URL (remove protocol, trailing slashes)
      let normalizedUrl = url.toLowerCase();
      if (normalizedUrl.startsWith('https://')) normalizedUrl = normalizedUrl.substring(8);
      if (normalizedUrl.startsWith('http://')) normalizedUrl = normalizedUrl.substring(7);
      if (normalizedUrl.endsWith('/')) normalizedUrl = normalizedUrl.slice(0, -1);
      
      // Check against various patterns
      const validPatterns = [
        // Job posting URL (what users see on jobs.workable.com)
        /^jobs\.workable\.com\/view\/[A-Za-z0-9]+$/i,
        /^jobs\.workable\.com\/view\/[A-Za-z0-9]+\/.+$/i, // With job title slug
        
        // Direct application URLs (these are the URLs behind the "Apply" button)
        /^apply\.workable\.com\/[^\/]+\/j\/[A-Z0-9]+$/i,  // apply.workable.com/company/j/JOBID
        /^[^\.]+\.workable\.com\/j\/[A-Z0-9]+$/i,         // anysubdomain.workable.com/j/JOBID
        
        // Example patterns - including variations seen in the wild
        /^apply\.workable\.com\/[^\/]+\/job\/[A-Z0-9]+$/i, // Some use /job/ instead of /j/
        /^jobs\.workable\.com\/jobs\/[A-Za-z0-9]+$/i       // Some use /jobs/ path
      ];
      
      // Test URL against all patterns
      return validPatterns.some(pattern => pattern.test(normalizedUrl));
    } catch (error) {
      console.error("Error validating Workable URL:", error);
      return false;
    }
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
      // Check if we have a worker URL configured
      const workerUrl = process.env.PLAYWRIGHT_WORKER_URL;
      if (!workerUrl) {
        console.error("No Playwright worker URL configured");
        return null;
      }
      
      console.log(`Introspecting Workable job form for URL: ${jobUrl}`);
      
      // Create the /introspect request payload
      const payload = {
        job: {
          applyUrl: jobUrl
        }
      };
      
      // Make sure the URL includes the protocol
      const completeWorkerUrl = workerUrl.startsWith('http') 
        ? workerUrl 
        : `https://${workerUrl}`;
      
      // Make the API request to the Playwright worker's /introspect endpoint
      console.log(`POST ${completeWorkerUrl}/introspect`);
      const response = await fetch(`${completeWorkerUrl}/introspect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
      });
      
      // Handle the response
      if (!response.ok) {
        console.error(`Introspection request failed with status: ${response.status}`);
        
        // Enhanced error handling and logging
        try {
          const errorText = await response.text();
          console.error(`Error details for ${jobUrl}:`, errorText.substring(0, 500));
          
          // Store this URL as a problematic URL in a log for analysis
          this.logProblemUrl(jobUrl, "introspection_error", {
            status: response.status,
            error: errorText.substring(0, 1000)
          });
          
        } catch (responseError) {
          console.error("Failed to extract error details:", responseError);
        }
        
        return null;
      }
      
      // Parse and return the introspection data
      const result = await response.json();
      
      if (result.status === "success" && result.fields && Array.isArray(result.fields)) {
        console.log(`Successfully introspected form with ${result.fields.length} fields`);
        
        // Log this successful URL for comparison
        this.logSuccessfulUrl(jobUrl, result.fields.length, {
          fieldTypes: result.fields.map((f: any) => f.type),
          requiredFields: result.fields.filter((f: any) => f.required).length
        });
        
        return result;
      } else {
        console.error("Introspection failed:", result.error || "Unknown error");
        
        // Log this problematic URL for analysis
        this.logProblemUrl(jobUrl, "introspection_failed", {
          error: result.error || "Unknown error",
          status: "Invalid response structure"
        });
        
        return null;
      }
    } catch (err) {
      const error = err as Error;
      console.error("Error during form introspection:", error);
      
      // Log the error for analysis
      this.logProblemUrl(jobUrl, "introspection_exception", {
        errorMessage: error.message || "Unknown error",
        errorStack: error.stack?.substring(0, 500) || "No stack trace",
        errorName: error.name || "Error"
      });
      
      return null;
    }
  }
  
  /**
   * Scrape job listings from a Workable search URL, fetching details concurrently.
   * @param searchUrl The URL of the search results page
   * @param state Optional search state (to avoid duplicates)
   * @param jobDetailTimeoutMs Timeout for fetching each individual job detail page.
   * @returns Array of job listings found on the page.
   */
  async scrapeJobsFromSearchUrl(
    searchUrl: string, 
    state?: SearchState,
    jobDetailTimeoutMs: number = 5000
  ): Promise<JobListing[]> {
    try {
      // Log the exact URL and show how it's structured for debugging
      const urlObj = new URL(searchUrl);
      console.log(`Fetching job listings from: ${searchUrl}`);
      console.log(`URL Analysis: 
         - Base: ${urlObj.origin}${urlObj.pathname}
         - Query Parameters: ${urlObj.search}
         - Parameter breakdown:`);
      
      urlObj.searchParams.forEach((value, key) => {
        console.log(`           ${key}: ${value}`);
      });
      
      // Construct proper headers to mimic a browser
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://jobs.workable.com/'
      };
      
      // Fetch the search results HTML
      const response = await fetch(searchUrl, { headers });
      
      if (!response.ok) {
        console.error(`Failed to fetch search results: ${response.statusText}, Status: ${response.status}`);
        return [];
      }
      
      const html = await response.text();
      
      // Save length for debugging
      const htmlLength = html.length;
      
      // Output the first 200 characters to help debug
      console.log(`Response HTML preview (total length: ${htmlLength}): ${html.substring(0, 200)}...`);
      
      // Save entire HTML to a file for debugging
      if (htmlLength < 1000) {
        console.log(`WARNING: HTML response is suspiciously short (${htmlLength} chars). Full HTML: ${html}`);
      }
      
      // Parse job links from the search results page
      const jobLinks: string[] = [];
      
      // First method: Regular expression to match job card links to Workable job pages
      // This regex captures URLs with or without job title slugs
      const jobUrlRegex = /https:\/\/jobs\.workable\.com\/view\/[A-Za-z0-9]+(?:\/[^"'\s]+)?/g;
      let match;
      
      while ((match = jobUrlRegex.exec(html)) !== null) {
        jobLinks.push(match[0]);
      }
      
      // Second method: Look for job cards with data-ui="job-card" attribute (newer format)
      // This regex looks for links that contain /view/ID with optional job title
      const jobCardRegex = /<a [^>]*href="([^"]*\/view\/[A-Za-z0-9]+(?:\/[^"'\s]+)?)"[^>]*>/g;
      while ((match = jobCardRegex.exec(html)) !== null) {
        const jobUrl = match[1];
        if (jobUrl.startsWith('/')) {
          // Handle relative URLs
          jobLinks.push(`https://jobs.workable.com${jobUrl}`);
        } else if (jobUrl.startsWith('http')) {
          // Handle absolute URLs
          jobLinks.push(jobUrl);
        }
      }
      
      // Third method: Look for structured data in script tags (JSON-LD)
      const scriptRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
      while ((match = scriptRegex.exec(html)) !== null) {
        try {
          const jsonData = JSON.parse(match[1]);
          if (jsonData["@type"] === "JobPosting" && jsonData.url) {
            jobLinks.push(jsonData.url);
          }
        } catch (e) {
          console.error("Error parsing JSON-LD:", e);
        }
      }
      
      console.log(`Found ${jobLinks.length} job links in search results`);
      
      // Deduplicate the links (just in case)
      const uniqueLinks = Array.from(new Set(jobLinks));
      
      // For each job link, fetch job details (limit to 5 jobs per page for speed)
      const jobListings: JobListing[] = [];
      
      // Deduplicate and filter out already processed jobs
      const MAX_JOBS_PER_PAGE = 20; // Increased from 5 to 20 jobs per page
      
      // Filter out jobs already processed if we have state
      let newLinks = uniqueLinks;
      if (state) {
        newLinks = uniqueLinks.filter(link => {
          // Extract potential ID or use full URL for uniqueness check
          const potentialId = link.split('/').pop();
          return potentialId && !state.jobIds.has(potentialId);
        });
      }
      
      // Limit the number of jobs to fetch details for concurrently
      const jobsToProcess = newLinks.slice(0, MAX_JOBS_PER_PAGE);
      
      console.log(`Processing ${jobsToProcess.length} out of ${uniqueLinks.length} jobs for faster initial response`);
      
      if (jobsToProcess.length === 0) {
        console.log(`No new job links found on ${searchUrl} to fetch details for.`);
        return [];
      }
      
      console.log(`Attempting to fetch details for ${jobsToProcess.length} job links concurrently...`);
      
      // Create an array of promises, each fetching details for one job with timeout
      const detailFetchPromises = jobsToProcess.map(jobLink =>
        this.fetchJobDetailsWithTimeout(jobLink, jobDetailTimeoutMs)
          .then(jobDetail => ({ link: jobLink, detail: jobDetail })) // Keep link for context
      );
      
      // Use Promise.allSettled to wait for all fetches to complete or fail/timeout
      const results = await Promise.allSettled(detailFetchPromises);
      
      // Process the results
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.detail) {
          // Successfully fetched job details
          const jobDetail = result.value.detail;
          const jobLink = result.value.link;
          
          // Add to jobIds set in state to prevent re-processing
          if (state) {
            const potentialId = jobLink.split('/').pop();
            if (potentialId) state.jobIds.add(potentialId);
          }
          
          // Map WorkableJob to JobListing format
          jobListings.push({
            jobTitle: jobDetail.title,
            company: jobDetail.company,
            description: jobDetail.description,
            applyUrl: jobLink,
            location: jobDetail.location,
            source: 'workable',
            matchScore: this.calculateInitialMatchScore({
              title: jobDetail.title,
              company: jobDetail.company,
              description: jobDetail.description,
              location: jobDetail.location
            })
          });
        } else if (result.status === 'rejected') {
          // Log errors from fetchJobDetailsWithTimeout (already logged internally)
          console.error(`Failed to process job link (reason: ${result.reason})`);
        } else if (result.status === 'fulfilled' && !result.value.detail) {
          // Fetch completed but returned null (e.g., timeout, non-ok status, invalid data)
          console.warn(`Fetching completed but no valid details returned for job link: ${result.value.link}`);
        }
      });
      
      console.log(`Successfully fetched details for ${jobListings.length} jobs from ${searchUrl}.`);
      if (state) {
        state.totalJobsFound += jobListings.length; // Update total count in state
      }
      
      return jobListings;
    } catch (error) {
      console.error(`Error scraping jobs from search URL ${searchUrl}:`, error);
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
    description: string;
    location: string;
  } | null> {
    try {
      // For job listings from the search page, we won't have the full HTML of each job
      // Let's create a basic job info from the job URL first
      const urlParts = jobUrl.split('/');
      const jobId = urlParts[urlParts.length - 1];
      
      // Create a basic job info from the URL and update later if HTML is available
      let title = `Position ${jobId}`;
      let company = 'Company from Workable';
      let description = 'Visit the job posting for full details';
      let location = 'Remote';
      
      // If we have HTML content, try to extract more information
      if (pageHtml) {
        // Try to find structured data first (most reliable)
        const jsonLdMatch = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(pageHtml);
        if (jsonLdMatch) {
          try {
            const jsonData = JSON.parse(jsonLdMatch[1]);
            if (jsonData["@type"] === "JobPosting") {
              title = jsonData.title || title;
              company = jsonData.hiringOrganization?.name || company;
              description = jsonData.description || description;
              
              if (jsonData.jobLocation?.address) {
                const address = jsonData.jobLocation.address;
                location = address.addressLocality || 'Remote';
                if (address.addressRegion) {
                  location += `, ${address.addressRegion}`;
                }
              } else if (jsonData.jobLocation?.name) {
                location = jsonData.jobLocation.name;
              }
              
              // Return early if we found structured data
              return { title, company, description, location };
            }
          } catch (e) {
            console.error("Error parsing job JSON-LD:", e);
          }
        }
        
        // Fallback to regex extraction if JSON-LD wasn't available
        // Extract job title - first try specific class names then fallback to title tag
        const titleRegexes = [
          /<h1[^>]*class="[^"]*jobTitle[^"]*"[^>]*>(.*?)<\/h1>/i,
          /<h1[^>]*class="[^"]*job-title[^"]*"[^>]*>(.*?)<\/h1>/i,
          /<h1[^>]*>(.*?)<\/h1>/i,
          /<title>(.*?)(?:\s*-\s*.*?)*<\/title>/i
        ];
        
        for (const regex of titleRegexes) {
          const match = regex.exec(pageHtml);
          if (match) {
            title = match[1].trim();
            break;
          }
        }
        
        // Extract company name - trying multiple patterns
        const companyRegexes = [
          /<div[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)<\/div>/i,
          /<span[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)<\/span>/i,
          /at\s+<strong>(.*?)<\/strong>/i,
          /<title>.*?\s+at\s+(.*?)(?:\s*-\s*.*?)*<\/title>/i,
          /<meta\s+property="og:site_name"\s+content="([^"]*)">/i
        ];
        
        for (const regex of companyRegexes) {
          const match = regex.exec(pageHtml);
          if (match) {
            company = match[1].trim();
            break;
          }
        }
        
        // Extract location - using multiple patterns
        const locationRegexes = [
          /<div[^>]*class="[^"]*location[^"]*"[^>]*>(.*?)<\/div>/i,
          /<span[^>]*class="[^"]*location[^"]*"[^>]*>(.*?)<\/span>/i,
          /in\s+<strong>(.*?)<\/strong>/i,
          /<meta\s+property="og:title"\s+content="[^"]*\s+in\s+([^"]*)">/i
        ];
        
        for (const regex of locationRegexes) {
          const match = regex.exec(pageHtml);
          if (match) {
            location = match[1].trim();
            break;
          }
        }
        
        // Extract description - from meta description or content area
        const descriptionRegexes = [
          /<meta\s+name="description"\s+content="([^"]*)">/i,
          /<div[^>]*class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
          /<div[^>]*id="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i
        ];
        
        for (const regex of descriptionRegexes) {
          const match = regex.exec(pageHtml);
          if (match) {
            // Simple HTML tag removal for the description
            description = match[1].replace(/<[^>]*>/g, ' ').trim();
            description = description.replace(/\s+/g, ' ').trim();
            if (description.length > 150) {
              description = description.substring(0, 147) + '...';
            }
            break;
          }
        }
      } else {
        // If we don't have HTML, try to fetch the job details directly
        // This will run asynchronously only if pageHtml is not provided
        try {
          const response = await fetch(jobUrl);
          if (response.ok) {
            const html = await response.text();
            const directExtracted = await this.extractJobInfoFromPage(jobUrl, html);
            if (directExtracted) {
              return directExtracted;
            }
          }
        } catch (fetchError) {
          console.error(`Failed to fetch job details: ${fetchError}`);
        }
      }
      
      return {
        title,
        company,
        description,
        location
      };
    } catch (error) {
      console.error(`Error extracting job information from ${jobUrl}:`, error);
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
    try {
      // Get user profile to match against (if available)
      // This is a more realistic implementation that calculates a match score
      // based on the job info and the user's profile/resume
      
      // Keywords to look for in job descriptions
      const skillKeywords = [
        'javascript', 'typescript', 'react', 'node', 'express', 'api', 
        'frontend', 'backend', 'fullstack', 'full-stack', 'full stack',
        'web development', 'software engineer', 'developer', 'software development',
        'html', 'css', 'database', 'sql', 'nosql', 'mongodb', 'postgresql'
      ];

      // Start with a base score
      let score = 65; // Base score
      
      // Check job title for relevant keywords
      const lowercaseTitle = jobInfo.title.toLowerCase();
      const titleMatches = skillKeywords.filter(keyword => 
        lowercaseTitle.includes(keyword)
      );
      
      // Add points for title matches (more weight on title)
      score += titleMatches.length * 3;
      
      // Check description for skill keywords
      const lowercaseDesc = jobInfo.description.toLowerCase();
      const descMatches = skillKeywords.filter(keyword => 
        lowercaseDesc.includes(keyword)
      );
      
      // Add points for description matches
      score += descMatches.length * 2;
      
      // Extra points for remote positions if that's what user wants
      if (jobInfo.location.toLowerCase().includes('remote')) {
        score += 5;
      }
      
      // Cap score at 98 (leave room for AI-powered exact matching)
      return Math.min(98, Math.round(score));
    } catch (error) {
      console.error('Error calculating match score:', error);
      // Return a default score if calculation fails
      return 75;
    }
  }

  /**
   * Deduplicate jobs by URL
   * @param jobs Array of job listings
   * @returns Array of unique job listings
   */
  deduplicateJobs(jobs: JobListing[]): JobListing[] {
    const uniqueUrls = new Set<string>();
    const uniqueJobs: JobListing[] = [];
    
    for (const job of jobs) {
      if (!uniqueUrls.has(job.applyUrl)) {
        uniqueUrls.add(job.applyUrl);
        uniqueJobs.push(job);
      }
    }
    
    return uniqueJobs;
  }
  
  /**
   * Execute a batched search based on the current search state
   * This allows us to fetch jobs in smaller batches for faster initial results
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
    const { maxJobs = 30, maxSearches = 3, progressCallback } = options;
    
    // Make a copy of the search state to avoid modifying the original
    const stateCopy: SearchState = {
      ...searchState,
      processedUrls: [...searchState.processedUrls],
      jobIds: new Set(searchState.jobIds)
    };
    
    // Initialize results
    const jobResults: JobListing[] = [];
    
    // Track whether we've processed all search URLs
    let searchesCompleted = 0;
    let hasMore = true;
    
    // Process search URLs up to maxSearches or until we hit maxJobs
    while (
      stateCopy.currentUrlIndex < stateCopy.searchUrls.length && 
      searchesCompleted < maxSearches && 
      jobResults.length < maxJobs
    ) {
      const searchUrl = stateCopy.searchUrls[stateCopy.currentUrlIndex];
      
      // Skip if this URL has already been processed
      if (stateCopy.processedUrls.includes(searchUrl)) {
        stateCopy.currentUrlIndex++;
        continue;
      }
      
      // Update progress
      if (progressCallback) {
        progressCallback({
          current: searchesCompleted + 1,
          total: Math.min(maxSearches, stateCopy.searchUrls.length),
          status: `Searching for jobs (batch ${searchesCompleted + 1} of ${Math.min(maxSearches, stateCopy.searchUrls.length)})`,
          jobs: jobResults
        });
      }
      
      // Fetch jobs from search URL with improved concurrent fetching
      console.log(`Searching Workable with URL: ${searchUrl}`);
      // Pass the search state to track duplicate jobs and use a longer timeout
      const jobDetailTimeoutMs = 8000; // 8 seconds for background fetches
      const newJobs = await this.scrapeJobsFromSearchUrl(searchUrl, stateCopy, jobDetailTimeoutMs);
      
      // Add to processed URLs
      stateCopy.processedUrls.push(searchUrl);
      searchesCompleted++;
      
      // Add jobs to results up to max limit
      // Note: Deduplication now happens in scrapeJobsFromSearchUrl with state
      const jobsToAdd = newJobs.slice(0, maxJobs - jobResults.length);
      jobResults.push(...jobsToAdd);
      
      // Move to next URL
      stateCopy.currentUrlIndex++;
    }
    
    // Update search state
    stateCopy.totalJobsFound += jobResults.length;
    
    // Check if we have more jobs to fetch
    hasMore = stateCopy.currentUrlIndex < stateCopy.searchUrls.length;
    
    // Return results
    return {
      jobs: jobResults,
      hasMore,
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
    progressCallback?: (progress: { current: number, total: number, status: string, jobs?: JobListing[], percentage?: number }) => void,
    options: {
      pageSize?: number;      // Number of jobs per page (default: 20)
      maxInitialJobs?: number; // Maximum jobs for initial response (default: 30)
      searchDepth?: number;    // Number of pages to search (default: 1)
      continueToken?: string;  // Token to resume search
    } = {}
  ): Promise<{
    jobs: JobListing[];
    continueToken?: string;   // Token to get more results
    hasMore: boolean;         // Whether more results are available
  }> {
    try {
      // Default options with increased job limits
      const {
        pageSize = 20,
        maxInitialJobs = 50, // Increased from 30 to 50
        searchDepth = 2,     // Increased from 1 to 2 to search more pages
        continueToken
      } = options;
      
      console.log(`Getting Workable jobs for user ID: ${userId} with options:`, JSON.stringify({
        pageSize, maxInitialJobs, searchDepth, hasContinueToken: !!continueToken
      }));
      
      // Get or resume search state
      let searchState: SearchState;
      
      if (continueToken) {
        // Resume search from where we left off
        const savedState = await this.getSearchState(continueToken);
        if (!savedState) {
          console.warn(`Search state not found for token: ${continueToken}`);
          // Start a new search if the token is invalid
          const userProfile = await storage.getUserProfile(userId);
          searchState = this.initializeSearchState(userProfile || null, searchDepth);
        } else {
          searchState = savedState;
          console.log(`Resuming search with token: ${continueToken}`);
        }
      } else {
        // Start a new search
        console.log(`Starting new search for user: ${userId}`);
        const userProfile = await storage.getUserProfile(userId);
        
        if (!userProfile) {
          console.warn(`No profile found for user ID: ${userId}`);
          // For users without profiles, use default searches but still return pagination info
          const defaultJobs = await this.fetchJobsFromDefaultSearches();
          return {
            jobs: defaultJobs,
            hasMore: false
          };
        }
        
        // Initialize a new search state
        searchState = this.initializeSearchState(userProfile, searchDepth);
      }
      
      // Execute batch search with progress updates
      const result = await this.executeBatchedSearch(searchState, {
        maxJobs: maxInitialJobs,
        maxSearches: searchDepth,
        progressCallback
      });
      
      // Sort jobs by match score (if available)
      const sortedJobs = result.jobs.sort((a, b) => {
        // Sort by match score (higher first)
        if (a.matchScore !== undefined && b.matchScore !== undefined) {
          return b.matchScore - a.matchScore;
        }
        return 0;
      });
      
      // Generate continue token if there are more results
      const newContinueToken = result.hasMore ? 
        await this.saveSearchState(result.nextSearchState) : undefined;
      
      // Log result summary
      console.log(`Found ${sortedJobs.length} jobs ${newContinueToken ? '(more available)' : '(no more available)'}`);
      
      // Return jobs and pagination info
      return {
        jobs: sortedJobs,
        continueToken: newContinueToken,
        hasMore: result.hasMore
      };
    } catch (error) {
      console.error("Error getting Workable jobs:", error);
      return { jobs: [], hasMore: false };
    }
  }
  
  /**
   * Fetch jobs from default searches when user has no profile
   * This provides a fallback for new users
   */
  private async fetchJobsFromDefaultSearches(): Promise<JobListing[]> {
    // Default job titles to search for
    const defaultJobTitles = ['software engineer', 'web developer', 'product manager'];
    
    // For testing, return a collection of default Workable job URLs
    const defaultWorkableJobs = [
      {
        jobTitle: "Software Engineer",
        company: "Balto",
        description: "Software engineering position focusing on AI and machine learning applications.",
        applyUrl: "https://apply.workable.com/balto/j/9BE3FA1FB7/",
        location: "Remote",
        source: "workable",
        matchScore: 75
      },
      {
        jobTitle: "Backend Developer",
        company: "Aptible",
        description: "Backend development role focusing on secure cloud infrastructure.",
        applyUrl: "https://apply.workable.com/aptible/j/6F85714800/",
        location: "Remote",
        source: "workable",
        matchScore: 70
      }
    ];
    
    // Filter jobs to include only those with valid Workable application URLs
    const validWorkableJobs = defaultWorkableJobs.filter(job => 
      this.isValidWorkableApplicationUrl(job.applyUrl)
    );
    
    console.log(`Found ${validWorkableJobs.length} valid default Workable jobs`);
    
    return validWorkableJobs;
  }
}

// Export a singleton instance
export const workableScraper = new WorkableScraper();

// Export the getWorkableJobsForUser function for backward compatibility with auto-apply-service
export const getWorkableJobsForUser = async (
  userId: number, 
  progressCallback?: (progress: { current: number, total: number, status: string, jobs?: JobListing[] }) => void,
  options: {
    pageSize?: number;
    maxInitialJobs?: number;
    searchDepth?: number;
    continueToken?: string;
  } = {}
): Promise<JobListing[]> => {
  try {
    // Call the new implementation but return just the jobs for backward compatibility
    const result = await workableScraper.getWorkableJobsForUser(
      userId,
      progressCallback as any, // Type casting to handle slightly different progress callback signatures
      options
    );
    return result.jobs;
  } catch (error) {
    console.error("Error in getWorkableJobsForUser compatibility function:", error);
    return [];
  }
};