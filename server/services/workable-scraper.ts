import { UserProfile, JobPreferences } from "@shared/schema.js";
import { storage } from "../storage.js";
import crypto from "crypto";
import Bottleneck from "bottleneck";

/**
 * Workable job search parameters
 */
interface WorkableSearchParams {
  // Internal parameters that are mapped to Workable's expected URL parameters
  query?: string; // Maps to 'query' parameter (search terms for job title/skills)
  location?: string; // Combined with query parameter (NOT using 'where')
  remote?: boolean; // Maps to 'workplace=remote' (valid values: 'remote' or 'hybrid', not 'on-site')
  workplace?: "remote" | "hybrid" | "any"; // Explicit workplace parameter (overrides remote)
  days?: 1 | 3 | 7 | 14 | 30 | "all"; // Maps to 'day_range' (not 'days')
  page?: number; // Maps to 'page' parameter
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
  source: "workable";
  appliedAt: Date | null;
  status: "found" | "queued" | "applied" | "failed" | "skipped";
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

const VITE_BACKEND_URL =
  process.env.VITE_BACKEND_URL || "http://localhost:5000";

export class WorkableScraper {
  private readonly BASE_URL = "https://jobs.workable.com/search";
  private searchStates: Map<string, SearchState> = new Map();

  // Global rate limiter for all Workable requests
  private limiter = new Bottleneck({
    maxConcurrent: 5, // Maximum 5 concurrent requests
    minTime: 100, // 100ms between requests
    reservoir: 100, // 100 requests per minute
    reservoirRefreshAmount: 100,
    reservoirRefreshInterval: 60 * 1000, // Refresh every minute
  });

  // Track problematic URLs that failed during introspection or application
  private problemUrls = new Map<
    string,
    Array<{
      timestamp: Date;
      type: string;
      details: any;
    }>
  >();

  // Track successful URLs for comparison
  private successfulUrls = new Map<
    string,
    Array<{
      timestamp: Date;
      fields: number;
      details: any;
    }>
  >();

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
      details,
    });

    // Log detailed information for analysis
    console.log(
      `PROBLEM_URL_LOG: ${url} | Type: ${type} | Details:`,
      typeof details === "object"
        ? JSON.stringify(details).substring(0, 500)
        : details
    );

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
      details,
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
      /\/([\w-]+)\/?$/,
    ];

    const patterns = {
      idLength: {} as Record<number, number>,
      idFirstChar: {} as Record<string, number>,
      idLastChar: {} as Record<string, number>,
      companies: {} as Record<string, { success: number; failure: number }>,
      domainPatterns: {
        jobsWorkable: { success: 0, failure: 0 },
        applyWorkable: { success: 0, failure: 0 },
        companyWorkable: { success: 0, failure: 0 },
        other: { success: 0, failure: 0 },
      },
    };

    // Analyze problematic URLs
    this.problemUrls.forEach((logs, url) => {
      // Check URL ID length
      const match = urlPattern.exec(url);
      if (match) {
        const id = match[1];
        patterns.idLength[id.length] = (patterns.idLength[id.length] || 0) + 1;
        patterns.idFirstChar[id[0]] = (patterns.idFirstChar[id[0]] || 0) + 1;
        patterns.idLastChar[id[id.length - 1]] =
          (patterns.idLastChar[id[id.length - 1]] || 0) + 1;
      }

      // Check URL domain pattern
      if (url.includes("jobs.workable.com")) {
        patterns.domainPatterns.jobsWorkable.failure++;
      } else if (url.includes("apply.workable.com")) {
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
      if (url.includes("jobs.workable.com")) {
        patterns.domainPatterns.jobsWorkable.success++;
      } else if (url.includes("apply.workable.com")) {
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
      domainSuccessRates[domain] =
        total > 0 ? (counts.success / total) * 100 : 0;
    }

    // Find companies with high failure rates
    const companyAnalysis = Object.entries(patterns.companies)
      .map(([company, counts]) => {
        const total = counts.success + counts.failure;
        const failureRate = total > 0 ? (counts.failure / total) * 100 : 0;
        return {
          company,
          failureRate,
          total,
          success: counts.success,
          failure: counts.failure,
        };
      })
      .filter((item) => item.total >= 3) // Only include companies with at least 3 attempts
      .sort((a, b) => b.failureRate - a.failureRate) // Sort by failure rate descending
      .slice(0, 10); // Top 10 problematic companies

    return {
      totalProblemUrls: this.problemUrls.size,
      totalSuccessfulUrls: this.successfulUrls.size,
      successRate:
        this.successfulUrls.size + this.problemUrls.size > 0
          ? (this.successfulUrls.size /
              (this.successfulUrls.size + this.problemUrls.size)) *
            100
          : 0,
      problemTypes: Array.from(this.problemUrls.values()).reduce(
        (counts, logs) => {
          logs.forEach((log) => {
            const type = log.type;
            counts[type] = (counts[type] || 0) + 1;
          });
          return counts;
        },
        {} as Record<string, number>
      ),
      patterns: {
        domainSuccessRates,
        idLengthDistribution: patterns.idLength,
        companyAnalysis,
      },
      // Sample of recent problems
      recentProblems: Array.from(this.problemUrls.entries())
        .slice(-5)
        .map(([url, logs]) => ({
          url,
          latestError: logs[logs.length - 1],
        })),
      // Sample of successful URLs
      recentSuccesses: Array.from(this.successfulUrls.entries())
        .slice(-5)
        .map(([url, logs]) => ({
          url,
          fields: logs[logs.length - 1].fields,
        })),
    };
  }

  /**
   * Initialize a new search state for a user profile
   * This prioritizes the most relevant job searches first
   */
  private initializeSearchState(
    userProfile: UserProfile | null,
    maxPages: number = 3,
    params: WorkableSearchParams = {}
  ): SearchState {
    const urls = this.generateSearchUrls(userProfile, maxPages, params);
    console.log(
      `Generated ${
        urls.length
      } search URLs for user profile with workplace preference: ${
        params.workplace || "not specified"
      }`
    );

    // Convert string URLs to URL objects with priorities
    const searchUrls = urls.map((url, index) => {
      // Assign higher priority to earlier URLs (primary search terms)
      // Priority is inverse to index, so first URLs have higher priority
      const priority = 1 - index / urls.length;
      return { url, priority };
    });

    return {
      userId: userProfile?.userId || 0,
      searchUrls,
      processedUrls: [],
      currentUrlIndex: 0,
      totalJobsFound: 0,
      jobIds: new Set<string>(),
      createdAt: new Date(),
    };
  }

  /**
   * Save search state and return a token that can be used to retrieve it later
   */
  private async saveSearchState(state: SearchState): Promise<string> {
    // Generate a random token
    const token = crypto.randomBytes(16).toString("hex");

    // Store the state in memory with the token as the key
    this.searchStates.set(token, state);

    // Remove old search states (older than 24 hours)
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
   * Remove search states older than 24 hours or completed ones
   */
  private cleanupOldSearchStates(): void {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Use forEach to avoid for...of iteration compatibility issues
    this.searchStates.forEach((state, token) => {
      // Keep search states for up to 24 hours
      // Only remove if it's older than 24 hours AND all URLs have been processed
      // (meaning there's no unprocessed URLs left)
      if (
        state.createdAt < oneDayAgo &&
        !state.searchUrls.some((u) => !state.processedUrls.includes(u.url))
      ) {
        console.log(
          `Removing search state ${token} (${state.totalJobsFound} jobs found) - older than 24h with no pending URLs`
        );
        this.searchStates.delete(token);
      }
    });
  }

  /**
   * Construct a Workable job search URL based on user profile and search parameters
   */
  buildSearchUrl(
    profile: UserProfile | null,
    params: WorkableSearchParams = {}
  ): string {
    console.log(`Building search URL with params:`, JSON.stringify(params));

    // Start with the base search URL
    const urlObj = new URL(this.BASE_URL);

    // Default parameters
    const defaultParams: WorkableSearchParams = {
      query: "",
      days: 30, // Increased from 14 days to 30 days for better job coverage
      workplace: "any",
      page: 1,
    };

    // Combine default params with provided params
    const combinedParams = { ...defaultParams, ...params };

    // Add user profile data if available
    if (profile) {
      // Use job titles from profile if available
      if (!combinedParams.query && profile.jobTitlesOfInterest?.length) {
        combinedParams.query = profile.jobTitlesOfInterest[0];
      }

      // Use location from profile if available
      if (!combinedParams.location && profile.locationsOfInterest?.length) {
        combinedParams.location = profile.locationsOfInterest[0];
      }

      // Update workplace logic using the new array-based preferences
      // First check for array-based workplace preferences
      if (
        Array.isArray(profile.workplaceOfInterest) &&
        profile.workplaceOfInterest.length > 0
      ) {
        // Check if remote is in the workplace preferences
        if (profile.workplaceOfInterest.includes("remote")) {
          combinedParams.workplace = "remote";
        }
        // If not remote but hybrid is in preferences
        else if (profile.workplaceOfInterest.includes("hybrid")) {
          combinedParams.workplace = "hybrid";
        }
        // If on-site only, use 'any' to not exclude potential matches
        else if (profile.workplaceOfInterest.includes("on-site")) {
          combinedParams.workplace = "any";
        }
      }
      // Fallback to legacy string-based preference for backward compatibility
      else if (
        Array.isArray(profile.preferredWorkArrangement) &&
        profile.preferredWorkArrangement.length > 0
      ) {
        // For array-based preferredWorkArrangement
        if (profile.preferredWorkArrangement.includes("remote")) {
          combinedParams.workplace = "remote";
        } else if (profile.preferredWorkArrangement.includes("hybrid")) {
          combinedParams.workplace = "hybrid";
        } else {
          combinedParams.workplace = "any";
        }
      }
      // Legacy string-based support (handle string as a single string, not array)
      else if (typeof profile.preferredWorkArrangement === "string") {
        if (profile.preferredWorkArrangement === "remote") {
          combinedParams.workplace = "remote";
        } else if (profile.preferredWorkArrangement === "hybrid") {
          combinedParams.workplace = "hybrid";
        }
      }
      // Only use 'any' if neither remote nor hybrid is set
      else if (!combinedParams.workplace) {
        combinedParams.workplace = "any";
      }
    }

    // Map our parameters to Workable's expected URL parameters
    if (combinedParams.query) {
      urlObj.searchParams.set("query", combinedParams.query);
    }

    // Handle location (appended to query, not its own parameter)
    if (
      combinedParams.location &&
      combinedParams.location.toLowerCase() !== "remote"
    ) {
      // Workable doesn't use 'where' parameter, location is combined with query
      const existingQuery = urlObj.searchParams.get("query") || "";
      const locationQuery = combinedParams.location.trim();

      if (existingQuery) {
        // Append location to existing query with 'in' keyword
        urlObj.searchParams.set(
          "query",
          `${existingQuery} in ${locationQuery}`
        );
      } else {
        // Just set location as the query
        urlObj.searchParams.set("query", locationQuery);
      }
    }

    // Workplace parameter now takes priority over remote
    if (combinedParams.workplace) {
      urlObj.searchParams.set("workspace", combinedParams.workplace);
    } else if (combinedParams.remote) {
      urlObj.searchParams.set("workspace", "remote");
    }

    // Map 'days' to Workable's 'day_range' parameter
    if (combinedParams.days) {
      if (combinedParams.days === "all") {
        // Don't set any day_range for 'all'
      } else {
        urlObj.searchParams.set("day_range", combinedParams.days.toString());
      }
    }

    // Add page parameter
    if (combinedParams.page && combinedParams.page > 1) {
      urlObj.searchParams.set("page", combinedParams.page.toString());
    }

    // Add sort by relevance
    urlObj.searchParams.set("sort", "relevance");

    const finalUrl = urlObj.toString();
    console.log(`Generated search URL: ${finalUrl}`);
    return finalUrl;
  }

  /**
   * Generate initial search URLs for a user profile
   * This creates multiple searches based on user's desired roles
   * Returns string URLs that will be converted to {url, priority} objects
   */
  generateSearchUrls(
    profile: UserProfile | null,
    maxPages: number = 3,
    params: WorkableSearchParams = {}
  ): string[] {
    const searchUrls: string[] = [];

    if (!profile) {
      // Generate a generic search URL if no profile
      return [this.buildSearchUrl(null, params)];
    }

    // Create more varied search queries based on profile
    let jobTitles = profile.jobTitlesOfInterest || [];

    // If user has no job titles or fewer than 3, add some default ones
    if (jobTitles.length < 3) {
      // Add some common tech job titles that weren't explicitly specified
      const defaultTitles = [
        "Software Engineer",
        "Web Developer",
        "Full Stack Developer",
        "Frontend Developer",
        "Backend Developer",
        "Software Developer",
        "React Developer",
        "JavaScript Developer",
        "Node.js Developer",
      ];

      // Filter out defaults that might duplicate existing preferences
      const additionalTitles = defaultTitles.filter(
        (title) =>
          !jobTitles.some(
            (userTitle: string) =>
              userTitle.toLowerCase().includes(title.toLowerCase()) ||
              title.toLowerCase().includes(userTitle.toLowerCase())
          )
      );

      // Add enough defaults to make at least 3 job titles
      jobTitles = [
        ...jobTitles,
        ...additionalTitles.slice(0, Math.max(0, 3 - jobTitles.length)),
      ];
    }

    console.log(`Using job titles for search: ${jobTitles.join(", ")}`);
    const searchQueries = jobTitles.slice(0, 3);

    // Start with just the first page for each job title
    // We'll dynamically generate more pages as needed
    for (const jobTitle of searchQueries) {
      // Start with page 1 for each job title
      console.log(
        `Adding initial search for job title "${jobTitle}" on page 1`
      );

      // Build the base URL with job title and workplace preferences
      const baseUrl = this.buildSearchUrl(profile, {
        query: jobTitle, // This will be used to build the 'query' parameter
        page: 1,
        workplace: params.workplace, // Include workplace preferences from params
        remote: params.remote, // Include remote flag from params
      });

      searchUrls.push(baseUrl);

      // Check if user has specified job experience levels
      if (
        Array.isArray(profile.jobExperienceLevel) &&
        profile.jobExperienceLevel.length > 0
      ) {
        console.log(
          `User has specified job experience levels: ${profile.jobExperienceLevel.join(
            ", "
          )}`
        );

        // Create experience-specific search URLs for each experience level
        const workableExperienceLevels: Record<string, string> = {
          entry: "entry_level",
          mid: "mid_level",
          senior: "senior_level",
          director: "director",
          executive: "executive",
        };

        // For each experience level the user is interested in, create a URL with that filter
        profile.jobExperienceLevel.forEach((level: string) => {
          const workableLevel = workableExperienceLevels[level];
          if (workableLevel) {
            const url = new URL(baseUrl);
            url.searchParams.set("experience", workableLevel);
            console.log(`Adding experience-filtered search: ${url.toString()}`);
            searchUrls.push(url.toString());
          }
        });
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
      const apiUrl = `${VITE_BACKEND_URL}/api/workable/direct-fetch?url=${encodeURIComponent(
        url
      )}`;

      const response = await fetch(apiUrl);
      if (!response.ok) {
        console.error(`Failed to fetch job details: ${response.statusText}`);
        return null;
      }

      const data = await response.json();

      // Return the job data from our API
      return data.job as WorkableJob;
    } catch (error) {
      console.error("Error fetching job details:", error);
      return null;
    }
  }

  /**
   * Fetch Workable job details with a cancellable timeout.
   * @param url The URL of the job detail page.
   * @param timeoutMs Timeout duration in milliseconds.
   * @returns WorkableJob or null if fetch fails or times out.
   */
  async fetchJobDetailsWithTimeout(
    url: string,
    timeoutMs: number = 10000
  ): Promise<WorkableJob | null> {
    // AbortController allows cancelling the fetch request
    const controller = new AbortController();
    const signal = controller.signal;

    // Set a timer to abort the request after timeoutMs
    const timeoutId = setTimeout(() => {
      console.log(`Timing out fetch for ${url} after ${timeoutMs}ms`);
      controller.abort();
    }, timeoutMs);

    try {
      console.log(
        `Workspaceing job details for ${url} with timeout ${timeoutMs}ms`
      );
      // Use our direct fetch API endpoint
      const apiUrl = `${VITE_BACKEND_URL}/api/workable/direct-fetch?url=${encodeURIComponent(
        url
      )}`;

      const response = await fetch(apiUrl, {
        signal, // Pass the AbortSignal to fetch
        headers: {
          // Add any necessary headers for our internal API
          Accept: "application/json",
        },
      });

      // Clear the timeout timer if the fetch completes or fails before the timeout
      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle non-2xx responses (e.g., 404, 500)
        console.error(
          `Failed to fetch job details (${url}): ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = await response.json();

      // Validate the structure of data.job before returning
      if (data && data.job && typeof data.job.title === "string") {
        // Add source and default status/appliedAt if missing from API response
        console.log(
          `Successfully fetched job details for ${url}: ${data.job.title}`
        );
        return {
          source: "workable",
          status: "found",
          appliedAt: null,
          ...data.job, // Spread the properties from API response
        } as WorkableJob;
      } else {
        console.error(
          `Invalid job data received from direct-fetch API for ${url}`
        );
        return null;
      }
    } catch (error: any) {
      // Clear the timeout timer in case of other errors
      clearTimeout(timeoutId);

      if (error.name === "AbortError") {
        // This specific error is thrown when controller.abort() is called
        console.warn(`Workspace aborted for ${url} due to timeout.`);
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
        /jobs\.workable\.com\/view\/[A-Za-z0-9]+\/.+$/i, // Pattern that includes job title slug
      ];

      return jobsPatterns.some((pattern) => pattern.test(url));
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
      if (normalizedUrl.startsWith("https://"))
        normalizedUrl = normalizedUrl.substring(8);
      if (normalizedUrl.startsWith("http://"))
        normalizedUrl = normalizedUrl.substring(7);
      if (normalizedUrl.endsWith("/"))
        normalizedUrl = normalizedUrl.slice(0, -1);

      // Check against various patterns
      const validPatterns = [
        // Job posting URL (what users see on jobs.workable.com)
        /^jobs\.workable\.com\/view\/[A-Za-z0-9]+$/i,
        /^jobs\.workable\.com\/view\/[A-Za-z0-9]+\/.+$/i, // With job title slug

        // Direct application URLs (these are the URLs behind the "Apply" button)
        /^apply\.workable\.com\/[^\/]+\/j\/[A-Z0-9]+$/i, // apply.workable.com/company/j/JOBID
        /^[^\.]+\.workable\.com\/j\/[A-Z0-9]+$/i, // anysubdomain.workable.com/j/JOBID

        // Example patterns - including variations seen in the wild
        /^apply\.workable\.com\/[^\/]+\/job\/[A-Z0-9]+$/i, // Some use /job/ instead of /j/
        /^jobs\.workable\.com\/jobs\/[A-Za-z0-9]+$/i, // Some use /jobs/ path
      ];

      // Test URL against all patterns
      return validPatterns.some((pattern) => pattern.test(normalizedUrl));
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
  async introspectJobForm(jobUrl: string, retryCount = 0): Promise<any> {
    const MAX_RETRIES = 2; // Maximum number of retry attempts

    try {
      // Check if we have a worker URL configured
      const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
      if (!workerUrl) {
        console.error("No Playwright worker URL configured");
        return null;
      }

      console.log(
        `Introspecting Workable job form for URL: ${jobUrl}${
          retryCount > 0 ? ` (Retry ${retryCount})` : ""
        }`
      );

      // Create the /introspect request payload
      const payload = {
        job: {
          applyUrl: jobUrl,
        },
      };

      // Make sure the URL includes the protocol
      const completeWorkerUrl = workerUrl.startsWith("http")
        ? workerUrl
        : `https://${workerUrl}`;

      // Make the API request to the Playwright worker's /introspect endpoint
      console.log(`POST ${completeWorkerUrl}/introspect`);
      const response = await fetch(`${completeWorkerUrl}/introspect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      // Handle the response
      if (!response.ok) {
        console.error(
          `Introspection request failed with status: ${response.status}`
        );

        // Enhanced error handling and logging
        try {
          const errorText = await response.text();
          console.error(
            `Error details for ${jobUrl}:`,
            errorText.substring(0, 500)
          );

          // Store this URL as a problematic URL in a log for analysis
          this.logProblemUrl(jobUrl, "introspection_error", {
            status: response.status,
            error: errorText.substring(0, 1000),
          });

          // If we haven't exceeded retry attempts, wait and try again
          if (retryCount < MAX_RETRIES) {
            console.log(`Retrying introspection for ${jobUrl} in 3 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds before retry
            return this.introspectJobForm(jobUrl, retryCount + 1);
          }
        } catch (responseError) {
          console.error("Failed to extract error details:", responseError);
        }

        return null;
      }

      // Parse and return the introspection data
      const result = await response.json();

      // Handle the new response format
      // Case 1: Success with nested formSchema
      if (
        result.status === "success" &&
        result.formSchema &&
        result.formSchema.status === "success" &&
        result.formSchema.fields &&
        Array.isArray(result.formSchema.fields)
      ) {
        const fields = result.formSchema.fields;
        console.log(
          `Successfully introspected form with ${fields.length} fields`
        );

        // Log this successful URL for comparison
        this.logSuccessfulUrl(jobUrl, fields.length, {
          fieldTypes: fields.map((f: any) => f.type),
          requiredFields: fields.filter((f: any) => f.required).length,
        });

        return result;
      }
      // Case 2: Legacy success format (direct fields array)
      else if (
        result.status === "success" &&
        result.fields &&
        Array.isArray(result.fields)
      ) {
        console.log(
          `Successfully introspected form with ${result.fields.length} fields (legacy format)`
        );

        // Log this successful URL for comparison
        this.logSuccessfulUrl(jobUrl, result.fields.length, {
          fieldTypes: result.fields.map((f: any) => f.type),
          requiredFields: result.fields.filter((f: any) => f.required).length,
        });

        return result;
      }
      // Case 3: Error response with success: false
      else if (result.success === false && result.error) {
        console.error(
          "Introspection failed:",
          result.error.message || result.error || "Unknown error"
        );

        // Log this problematic URL for analysis
        this.logProblemUrl(jobUrl, "introspection_failed", {
          error: result.error.message || result.error || "Unknown error",
          status: result.error.status || "Error Response",
          details: result.error.details || null,
        });

        // Pass through the error response for the frontend to handle
        return result;
      }
      // Case 4: Unrecognized response format
      else {
        console.error(
          "Introspection failed: Invalid response structure",
          result
        );

        // Log this problematic URL for analysis
        this.logProblemUrl(jobUrl, "introspection_failed", {
          error: result.error || "Unknown error",
          status: "Invalid response structure",
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
        errorName: error.name || "Error",
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
    jobDetailTimeoutMs: number = 30000,
    useDirectFetch: boolean = false
  ): Promise<JobListing[]> {
    try {
      const urlObj = new URL(searchUrl);
      const query = urlObj.searchParams.get("query") || "";
      // Extract current page from URL or default to 1
      const currentPage = parseInt(urlObj.searchParams.get("page") || "1", 10);
      console.log(
        `Workspaceing job listings from: ${searchUrl}${
          useDirectFetch ? " (using direct fetch method)" : ""
        }`
      );

      // Get HTML content - either from Playwright worker or direct fetch
      let html = "";

      if (useDirectFetch) {
        // Use direct fetch without Playwright
        console.log(
          `Using direct HTML fetch for ${searchUrl} (bypassing Playwright worker)`
        );
        try {
          const response = await this.limiter.schedule(() =>
            fetch(searchUrl, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                Accept: "text/html,application/xhtml+xml",
                "Accept-Language": "en-US,en;q=0.9",
              },
              signal: AbortSignal.timeout(30000), // 30 second timeout
            })
          );

          if (!response.ok) {
            console.error(
              `Direct HTML fetch failed: ${response.status} ${response.statusText}`
            );
            return [];
          }

          html = await response.text();

          if (html.length < 1000) {
            console.warn(
              `Direct fetch returned suspiciously short HTML (${html.length} chars)`
            );
          }
        } catch (error) {
          console.error(
            `Error during direct HTML fetch: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
          return [];
        }
      } else {
        // Use Playwright worker to scroll and extract job links
        const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
        if (!workerUrl) {
          console.error("No Playwright worker URL configured");
          return [];
        }
        const completeWorkerUrl = workerUrl.startsWith("http")
          ? workerUrl
          : `https://${workerUrl}`;
        const payload = {
          url: searchUrl,
          scroll: true,
          maxScrolls: 50,
        };
        const response = await this.limiter.schedule(() =>
          fetch(`${completeWorkerUrl}/scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        );

        if (!response.ok) {
          if (response.status === 429) {
            const retryAfter = parseInt(
              response.headers.get("retry-after") || "10",
              10
            );
            console.warn(
              `Rate limited (429) when fetching ${searchUrl}. Queuing for retry after ${retryAfter}s`
            );
            this.logProblemUrl(searchUrl, "rate_limited_429", {
              timestamp: new Date().toISOString(),
              retryAfter,
            });
            if (state) {
              const rateLimitKey = `rate_limit_${query}`;
              const attempts = (state[rateLimitKey] || 0) + 1;
              state[rateLimitKey] = attempts;
              const backoffPriority = Math.max(
                0.05,
                0.5 / Math.pow(2, attempts)
              );
              setTimeout(() => {
                state.searchUrls.push({
                  url: searchUrl,
                  priority: backoffPriority,
                });
                console.log(
                  `Re-queued rate-limited URL with priority ${backoffPriority.toFixed(
                    3
                  )} (attempt ${attempts})`
                );
              }, retryAfter * 1000);
            }
            return [];
          }

          console.error(
            `Failed to fetch: ${response.statusText}, Status: ${response.status}`
          );
          // Instead of returning empty array, fall through to direct fetch as a backup
          console.log(
            `Falling back to direct HTML fetch since Playwright worker request failed`
          );

          // Recursively call self with useDirectFetch=true
          return this.scrapeJobsFromSearchUrl(
            searchUrl,
            state,
            jobDetailTimeoutMs,
            true
          );
        }

        html = await response.text();
      }

      const htmlLength = html.length;

      // Debug info
      if (htmlLength < 1000) {
        console.log(
          `WARNING: HTML response is suspiciously short (${htmlLength} chars).`
        );
      }

      // Extract job links from the page - we'll combine multiple extraction methods
      const jobLinks: string[] = [];

      // Method 1: Direct URL extraction with regex
      const jobUrlRegex =
        /https:\/\/jobs\.workable\.com\/view\/[A-Za-z0-9]+(?:\/[^"'\s]+)?/g;
      let match;
      while ((match = jobUrlRegex.exec(html)) !== null) {
        jobLinks.push(match[0]);
      }

      // Method 2: HTML link parsing
      const jobCardRegex =
        /<a [^>]*href="([^"]*\/view\/[A-Za-z0-9]+(?:\/[^"'\s]+)?)"[^>]*>/g;
      while ((match = jobCardRegex.exec(html)) !== null) {
        const jobUrl = match[1];
        if (jobUrl.startsWith("/")) {
          jobLinks.push(`https://jobs.workable.com${jobUrl}`);
        } else if (jobUrl.startsWith("http")) {
          jobLinks.push(jobUrl);
        }
      }

      // Method 3: JSON-LD extraction (structured data)
      const scriptRegex =
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
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

      // Deduplicate the links
      const uniqueLinks = Array.from(new Set(jobLinks));

      // NEW: Calculate page metrics for tracking effectiveness
      const totalJobsOnPage = uniqueLinks.length;
      console.log(
        `Found ${totalJobsOnPage} unique job links on page ${currentPage} for query "${query}"`
      );

      // Filter out already processed jobs
      let newLinks = uniqueLinks;
      if (state) {
        newLinks = uniqueLinks.filter((link) => {
          const potentialId = link.split("/").pop();
          return potentialId && !state.jobIds.has(potentialId);
        });
      }

      // NEW: Track new vs total for effectiveness metrics
      const newJobsFound = newLinks.length;
      const duplicateJobsFound = totalJobsOnPage - newJobsFound;

      // Calculate effectiveness score (0-1): ratio of new jobs to total jobs
      // This helps prioritize which search paths are most productive
      // Higher = more effective search, lower = more duplicates/exhausted
      const effectivenessScore =
        totalJobsOnPage > 0 ? newJobsFound / totalJobsOnPage : 0;

      console.log(
        `Page effectiveness: ${(effectivenessScore * 100).toFixed(
          1
        )}% (${newJobsFound} new, ${duplicateJobsFound} duplicates)`
      );

      // Store effectiveness metrics in search state
      if (state) {
        // Track effectiveness by query
        const queryEffectivenessKey = `effectiveness_${query}`;

        // Use exponential moving average to smooth effectiveness values
        const previousEffectiveness = state[queryEffectivenessKey] || 0;
        const alpha = 0.3; // Weighting for new values (0.3 = 30% weight to new value)

        state[queryEffectivenessKey] =
          previousEffectiveness * (1 - alpha) + effectivenessScore * alpha;

        // Record the last page processed
        state[`last_page_${query}`] = currentPage;
      }

      // Process more jobs at once to avoid missing potential matches
      // const MAX_JOBS_PER_PAGE = 200; // Increased from 20 to 200 to match our other limits
      // const jobsToProcess = newLinks.slice(0, MAX_JOBS_PER_PAGE);
      // Instead, process all new jobs found on the page
      const jobsToProcess = newLinks;

      // Handle case of no new jobs on this page
      if (jobsToProcess.length === 0) {
        if (state) {
          // Track consecutive empty pages to know when to stop
          const emptyPagesKey = `empty_pages_${query}`;
          const consecutiveEmptyPages =
            (state[emptyPagesKey] || 0) + (jobsToProcess.length === 0 ? 1 : 0);
          state[emptyPagesKey] = consecutiveEmptyPages;

          // Adaptive page limit - if query has been effective, we'll check more pages
          let maxEmptyPages = 3;

          if (state[`effectiveness_${query}`] > 0.4) {
            // For high-yield queries, go deeper
            maxEmptyPages = 5;
          }

          if (totalJobsOnPage === 0) {
            // Truly empty page = end of results, stop pagination
            console.log(
              `Empty page (no jobs) for query "${query}". End of results reached.`
            );
            return [];
          } else if (consecutiveEmptyPages < maxEmptyPages) {
            // All duplicates but not at limit, continue to next page with lower priority
            console.log(
              `All ${totalJobsOnPage} jobs already processed. This is empty page #${consecutiveEmptyPages}/${maxEmptyPages}`
            );

            // Add next page with lower priority
            const nextPageUrl = this.generateNextPageUrl(
              searchUrl,
              currentPage + 1
            );
            if (
              nextPageUrl &&
              !state.searchUrls.some((u) => u.url === nextPageUrl) &&
              !state.processedUrls.includes(nextPageUrl)
            ) {
              // Lower priority based on consecutive empty pages
              const priority = Math.max(0.2, 0.8 - consecutiveEmptyPages * 0.2);

              state.searchUrls.push({ url: nextPageUrl, priority });
              console.log(
                `Added next page with reduced priority ${priority.toFixed(
                  2
                )} due to consecutive empty pages`
              );
            }
          } else {
            // Reached max empty pages, stop pagination for this query
            console.log(
              `Reached ${maxEmptyPages} consecutive pages with all duplicate jobs. Stopping pagination for "${query}"`
            );
          }
        }

        // Mark this URL as processed
        if (state) {
          state.processedUrls.push(searchUrl);
        }

        return [];
      } else if (state) {
        // Found new jobs, reset empty pages counter
        state[`empty_pages_${query}`] = 0;
      }

      // Fetch job details concurrently
      console.log(
        `Workspaceing details for ${jobsToProcess.length} jobs concurrently...`
      );

      // Create array of promises, each fetching job details
      const detailFetchPromises = jobsToProcess.map((jobLink) =>
        this.limiter
          .schedule(() =>
            this.fetchJobDetailsWithTimeout(jobLink, jobDetailTimeoutMs)
          )
          .then((jobDetail) => ({ link: jobLink, detail: jobDetail }))
      );

      // Wait for all requests to complete or timeout
      const results = await Promise.allSettled(detailFetchPromises);

      // Process the results
      const jobListings: JobListing[] = [];
      let successfulDetailsCount = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value.detail) {
          // Successfully fetched job details
          const jobDetail = result.value.detail;
          const jobLink = result.value.link;
          successfulDetailsCount++;

          // Mark job ID as processed
          if (state) {
            const potentialId = jobLink.split("/").pop();
            if (potentialId) state.jobIds.add(potentialId);
          }

          // Calculate match score for job
          const matchScore = this.calculateInitialMatchScore({
            title: jobDetail.title,
            company: jobDetail.company,
            description: jobDetail.description,
            location: jobDetail.location,
          });

          // Add to job listings
          jobListings.push({
            jobTitle: jobDetail.title,
            company: jobDetail.company,
            description: jobDetail.description,
            applyUrl: jobLink,
            location: jobDetail.location,
            source: "workable",
            matchScore,
          });
        }
      });

      console.log(
        `Successfully fetched ${successfulDetailsCount}/${jobsToProcess.length} job details from ${searchUrl}`
      );

      // Update search state with results
      if (state) {
        // Mark this URL as processed
        state.processedUrls.push(searchUrl);

        // Update total job count
        state.totalJobsFound += jobListings.length;

        // Calculate average match score for this page (if jobs found)
        const avgMatchScore =
          jobListings.length > 0
            ? jobListings.reduce((sum, job) => sum + (job.matchScore || 0), 0) /
              jobListings.length
            : 0;

        // Combined effectiveness score includes both job yield and match quality
        const combinedEffectiveness =
          effectivenessScore * (avgMatchScore / 100);

        // IMPROVED PAGINATION STRATEGY: Prioritize based on quality and quantity
        // Continue pagination if:
        // 1. Found new jobs (effectiveness > 0)
        // 2. Not hit the maximum page limit
        // 3. Query is not exhausted (consecutively empty pages < limit)
        const MAX_PAGES = 5; // Limit to 5 pages per query

        if (
          currentPage < MAX_PAGES &&
          (effectivenessScore > 0 || totalJobsOnPage === 0)
        ) {
          const nextPageUrl = this.generateNextPageUrl(
            searchUrl,
            currentPage + 1
          );

          if (
            nextPageUrl &&
            !state.searchUrls.some((u) => u.url === nextPageUrl) &&
            !state.processedUrls.includes(nextPageUrl)
          ) {
            // Calculate priority for next page:
            // - Higher effectiveness = higher priority
            // - Higher match scores = higher priority
            // - First few pages get higher priority by default
            let basePriority = effectivenessScore;

            // Boost priority for high-quality results
            if (avgMatchScore > 80) basePriority += 0.2;

            // Cap at 0.9 to ensure initial search URLs maintain highest priority
            const priority = Math.min(0.9, Math.max(0.1, basePriority));

            // Add to queue with calculated priority
            state.searchUrls.push({ url: nextPageUrl, priority });

            console.log(
              `Added next page ${
                currentPage + 1
              } to queue with priority ${priority.toFixed(2)}`
            );
          }
        } else {
          console.log(
            `Not adding next page: reached limit (${currentPage}/${MAX_PAGES}) or low effectiveness`
          );
        }
      }

      return jobListings;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`Error scraping jobs from ${searchUrl}:`, errorMsg);

      // Enhanced error handling with exponential backoff
      if (state) {
        // Extract query and page information from URL if possible
        let queryValue = "unknown";
        let pageNumber = 1;

        try {
          // Try to extract query from URL
          const urlObj = new URL(searchUrl);
          queryValue = urlObj.searchParams.get("query") || "unknown";
          pageNumber = parseInt(urlObj.searchParams.get("page") || "1", 10);
        } catch (e) {
          console.error("Could not parse URL for error tracking:", e);
        }

        // Use a more detailed error key that includes query information
        const errorKey = `exception_${queryValue}_page${pageNumber}`;
        const attempts = (state[errorKey] || 0) + 1;
        state[errorKey] = attempts;

        // Only retry a limited number of times with exponential backoff
        if (attempts <= 3) {
          // Calculate exponential backoff priority - gets lower with each retry
          const backoffPriority = Math.max(0.01, 0.25 / Math.pow(2, attempts));

          // Re-queue with decreasing priority
          state.searchUrls.push({
            url: searchUrl,
            priority: backoffPriority,
          });

          console.log(
            `URL fetch failed with exception, re-queued with priority ${backoffPriority.toFixed(
              3
            )} (attempt ${attempts})`
          );

          // Log the exception for pattern analysis
          this.logProblemUrl(searchUrl, "exception", {
            errorMessage: errorMsg.substring(0, 500),
            query: queryValue,
            page: pageNumber,
            attempt: attempts,
            timestamp: new Date().toISOString(),
          });

          // Don't consider this processed yet - we need to retry
          state.processedUrls = state.processedUrls.filter(
            (url) => url !== searchUrl
          );
        } else {
          console.log(
            `URL fetch failed ${attempts} times with exceptions, giving up: ${searchUrl}`
          );

          // Mark as processed to avoid infinite retries
          state.processedUrls.push(searchUrl);

          // Log final failure
          this.logProblemUrl(searchUrl, "exception_max_retries", {
            errorMessage: errorMsg.substring(0, 500),
            query: queryValue,
            page: pageNumber,
            finalAttempt: attempts,
            timestamp: new Date().toISOString(),
          });
        }
      }

      return [];
    }
  }

  /**
   * Helper method to generate the URL for the next page of search results
   */
  private generateNextPageUrl(
    currentUrl: string,
    nextPageNum: number
  ): string | null {
    try {
      const urlObj = new URL(currentUrl);

      // Update or add the page parameter
      urlObj.searchParams.set("page", nextPageNum.toString());

      return urlObj.toString();
    } catch (error) {
      console.error("Error generating next page URL:", error);
      return null;
    }
  }

  /**
   * Extract job information from a job page
   * @param jobUrl The URL of the job page
   * @param html The HTML content of the page (optional)
   * @returns Job information object or null if extraction failed
   */
  async extractJobInfoFromPage(
    jobUrl: string,
    pageHtml?: string
  ): Promise<{
    title: string;
    company: string;
    description: string;
    location: string;
  } | null> {
    try {
      // For job listings from the search page, we won't have the full HTML of each job
      // Let's create a basic job info from the job URL first
      const urlParts = jobUrl.split("/");
      const jobId = urlParts[urlParts.length - 1];

      // Create a basic job info from the URL and update later if HTML is available
      let title = `Position ${jobId}`;
      let company = "Company from Workable";
      let description = "Visit the job posting for full details";
      let location = "Remote";

      // If we have HTML content, try to extract more information
      if (pageHtml) {
        // Try to find structured data first (most reliable)
        const jsonLdMatch =
          /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(
            pageHtml
          );
        if (jsonLdMatch) {
          try {
            const jsonData = JSON.parse(jsonLdMatch[1]);
            if (jsonData["@type"] === "JobPosting") {
              title = jsonData.title || title;
              company = jsonData.hiringOrganization?.name || company;
              description = jsonData.description || description;

              if (jsonData.jobLocation?.address) {
                const address = jsonData.jobLocation.address;
                location = address.addressLocality || "Remote";
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
          /<title>(.*?)(?:\s*-\s*.*?)*<\/title>/i,
        ];

        for (const regex of titleRegexes) {
          const match = regex.exec(pageHtml);
          if (match) {
            title = match[1].trim();
            break;
          }
        }

        // Extract company name - prefer <a> inside <h2 data-ui="overview-company">
        let companyExtracted = false;
        const overviewCompanyMatch = pageHtml.match(
          /<h2[^>]*data-ui=["']overview-company["'][^>]*>[\s\S]*?<a[^>]*>(.*?)<\/a>[\s\S]*?<\/h2>/i
        );
        if (overviewCompanyMatch && overviewCompanyMatch[1]) {
          const candidate = overviewCompanyMatch[1].trim();
          // Avoid extracting button/link text like 'view'
          if (candidate && candidate.toLowerCase() !== "view") {
            company = candidate;
            companyExtracted = true;
          }
        }
        // Fallback to previous regexes if not found
        if (!companyExtracted) {
          const companyRegexes = [
            /<div[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)<\/div>/i,
            /<span[^>]*class="[^"]*company[^"]*"[^>]*>(.*?)<\/span>/i,
            /at\s+<strong>(.*?)<\/strong>/i,
            /<title>.*?\s+at\s+(.*?)(?:\s*-\s*.*?)*<\/title>/i,
            /<meta\s+property="og:site_name"\s+content="([^"]*)">/i,
          ];
          for (const regex of companyRegexes) {
            const match = regex.exec(pageHtml);
            if (match) {
              const candidate = match[1].trim();
              if (candidate && candidate.toLowerCase() !== "view") {
                company = candidate;
                break;
              }
            }
          }
        }

        // Extract location - using multiple patterns
        const locationRegexes = [
          /<div[^>]*class="[^"]*location[^"]*"[^>]*>(.*?)<\/div>/i,
          /<span[^>]*class="[^"]*location[^"]*"[^>]*>(.*?)<\/span>/i,
          /in\s+<strong>(.*?)<\/strong>/i,
          /<meta\s+property="og:title"\s+content="[^"]*\s+in\s+([^"]*)">/i,
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
          /<div[^>]*id="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        ];

        for (const regex of descriptionRegexes) {
          const match = regex.exec(pageHtml);
          if (match) {
            // Simple HTML tag removal for the description
            description = match[1].replace(/<[^>]*>/g, " ").trim();
            description = description.replace(/\s+/g, " ").trim();
            if (description.length > 150) {
              description = description.substring(0, 147) + "...";
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
            const directExtracted = await this.extractJobInfoFromPage(
              jobUrl,
              html
            );
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
        location,
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
      // Calculate match score based on the four key components:
      // 1. Direct keyword match: 30% of score
      // 2. Role alignment: 30% of score
      // 3. Experience level match: 25% of score
      // 4. Education alignment: 15% of score

      // Match weights
      const KEYWORD_MATCH_WEIGHT = 0.3; // 30%
      const ROLE_ALIGNMENT_WEIGHT = 0.3; // 30%
      const EXPERIENCE_MATCH_WEIGHT = 0.25; // 25%
      const EDUCATION_MATCH_WEIGHT = 0.15; // 15%

      // Keywords to look for in job descriptions
      const skillKeywords = [
        "javascript",
        "typescript",
        "react",
        "node",
        "express",
        "api",
        "frontend",
        "backend",
        "fullstack",
        "full-stack",
        "full stack",
        "web development",
        "software engineer",
        "developer",
        "software development",
        "html",
        "css",
        "database",
        "sql",
        "nosql",
        "mongodb",
        "postgresql",
      ];

      // Get user profile info
      // Start with a base score in each category
      let keywordMatchScore = 65;
      let roleAlignmentScore = 65;
      let experienceLevelScore = 65;
      let educationScore = 65;

      // Look for role alignment in the job title
      const lowercaseTitle = jobInfo.title.toLowerCase();
      const titleMatches = skillKeywords.filter((keyword) =>
        lowercaseTitle.includes(keyword)
      );

      // Improved role alignment score
      roleAlignmentScore += titleMatches.length * 5;

      // Check description for keyword matches
      const lowercaseDesc = jobInfo.description.toLowerCase();
      const descMatches = skillKeywords.filter((keyword) =>
        lowercaseDesc.includes(keyword)
      );

      // Improved keyword match score
      keywordMatchScore += descMatches.length * 3;

      // Check for experience level indicators in the title and description
      const experienceLevelMap = {
        entry_level: [
          "entry level",
          "junior",
          "associate",
          "graduate",
          "grad",
          "trainee",
          "apprentice",
          "internship",
          "co-op",
          "college",
        ],
        mid_senior_level: [
          "mid level",
          "senior",
          "sr.",
          "lead",
          "principal",
          "staff",
          "experienced",
          "mid-level",
        ],
        director: ["director", "head of", "manager", "manage", "management"],
        executive: [
          "executive",
          "chief",
          "vp",
          "vice president",
          "cto",
          "cio",
          "ceo",
          "founder",
        ],
      };

      // Look for experience level terms in title and description
      let experienceLevelMatches = 0;
      Object.entries(experienceLevelMap).forEach(([level, terms]) => {
        if (
          terms.some(
            (term) =>
              lowercaseTitle.includes(term) || lowercaseDesc.includes(term)
          )
        ) {
          experienceLevelMatches += 1;
        }
      });

      // Score for experience level
      experienceLevelScore += experienceLevelMatches * 10;

      // Check for education requirements
      const educationTerms = [
        "bachelor",
        "master",
        "phd",
        "degree",
        "bs",
        "ms",
        "ba",
        "education",
        "university",
      ];
      const educationMatches = educationTerms.filter((term) =>
        lowercaseDesc.includes(term)
      );
      educationScore += educationMatches.length * 5;

      // Additional points for remote positions when needed
      if (jobInfo.location.toLowerCase().includes("remote")) {
        roleAlignmentScore += 5;
      }

      // Cap individual scores at 100
      keywordMatchScore = Math.min(100, keywordMatchScore);
      roleAlignmentScore = Math.min(100, roleAlignmentScore);
      experienceLevelScore = Math.min(100, experienceLevelScore);
      educationScore = Math.min(100, educationScore);

      // Calculate weighted total score
      const totalScore =
        keywordMatchScore * KEYWORD_MATCH_WEIGHT +
        roleAlignmentScore * ROLE_ALIGNMENT_WEIGHT +
        experienceLevelScore * EXPERIENCE_MATCH_WEIGHT +
        educationScore * EDUCATION_MATCH_WEIGHT;

      // Cap final score at 98 (leave room for AI-powered exact matching)
      return Math.min(98, Math.round(totalScore));
    } catch (error) {
      console.error("Error calculating match score:", error);
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
      searchUrls: [...searchState.searchUrls], // Deep clone the URLs array
      processedUrls: [...searchState.processedUrls],
      jobIds: new Set(searchState.jobIds),
      // Copy other dynamic properties
      ...Object.fromEntries(
        Object.entries(searchState).filter(
          ([key]) => !["searchUrls", "processedUrls", "jobIds"].includes(key)
        )
      ),
    };

    // Initialize results
    const jobResults: JobListing[] = [];

    // Track whether we've processed all search URLs
    let searchesCompleted = 0;
    let hasMore = true;

    // IMPROVED APPROACH: Sort search URLs by priority before processing
    stateCopy.searchUrls.sort((a, b) => b.priority - a.priority);

    console.log(
      `Starting batched search with ${stateCopy.searchUrls.length} URLs in queue`
    );
    // Log the top 3 URLs with their priorities for debugging
    stateCopy.searchUrls.slice(0, 3).forEach((urlObj, i) => {
      console.log(
        `Queue #${i + 1}: ${urlObj.url} (priority: ${urlObj.priority.toFixed(
          2
        )})`
      );
    });

    // Process search URLs up to maxSearches or until we hit maxJobs
    const processedUrlsInThisBatch = new Set<string>();

    while (
      stateCopy.searchUrls.length > 0 &&
      searchesCompleted < maxSearches &&
      jobResults.length < maxJobs
    ) {
      // Choose the highest priority URL that hasn't been processed
      // This approach uses priority instead of sequential index
      const urlIndex = stateCopy.searchUrls.findIndex((urlObj) => {
        // Check if this URL has already been processed
        const isProcessed = stateCopy.processedUrls.some(
          (url) => url === urlObj.url
        );
        const isInCurrentBatch = processedUrlsInThisBatch.has(urlObj.url);
        return !isProcessed && !isInCurrentBatch;
      });

      // If no unprocessed URLs available, break the loop
      if (urlIndex === -1) {
        console.log(
          `No more unprocessed URLs available. Breaking the batch loop.`
        );
        break;
      }

      const urlObj = stateCopy.searchUrls[urlIndex];
      const searchUrl = urlObj.url;

      // Update progress
      if (progressCallback) {
        const query = new URL(searchUrl).searchParams.get("query") || "unknown";
        const page = parseInt(
          new URL(searchUrl).searchParams.get("page") || "1"
        );
        if (progressCallback) {
          progressCallback({
            current: searchesCompleted + 1,
            total: Math.min(maxSearches, stateCopy.searchUrls.length),
            status: `Searching (batch ${
              searchesCompleted + 1
            }, query: ${query}, page: ${page})`,
            jobs: jobResults,
            percentage: ((searchesCompleted + 1) / maxSearches) * 100,
          });
        }
      }

      // Fetch jobs from search URL with improved concurrent fetching and rate limiting
      console.log(
        `Searching Workable with URL: ${searchUrl} (priority: ${urlObj.priority.toFixed(
          2
        )})`
      );
      // Pass the search state to track duplicate jobs and use a longer timeout
      const jobDetailTimeoutMs = 8000; // 8 seconds for background fetches
      const newJobs = await this.scrapeJobsFromSearchUrl(
        searchUrl,
        stateCopy,
        jobDetailTimeoutMs
      );

      // Mark URL as processed in this batch
      processedUrlsInThisBatch.add(searchUrl);
      stateCopy.processedUrls.push(searchUrl);
      searchesCompleted++;

      // Add jobs to results up to max limit
      // Note: Deduplication happens in scrapeJobsFromSearchUrl with state
      const jobsToAdd = newJobs.slice(0, maxJobs - jobResults.length);
      jobResults.push(...jobsToAdd);

      console.log(
        `Found ${newJobs.length} jobs from ${searchUrl}, added ${jobsToAdd.length} to results`
      );

      // Log queue state for debugging
      console.log(`Queue state: ${stateCopy.searchUrls.length} URLs remaining`);
      stateCopy.searchUrls.slice(0, 3).forEach((urlObj, i) => {
        const nextQuery =
          new URL(urlObj.url).searchParams.get("query") || "unknown";
        const nextPage = parseInt(
          new URL(urlObj.url).searchParams.get("page") || "1"
        );
        console.log(
          `Remaining Queue #${i + 1}: ${urlObj.url.substring(
            0,
            60
          )}... (priority: ${urlObj.priority.toFixed(
            2
          )}, query: ${nextQuery}, page: ${nextPage})`
        );
      });
    }

    // Remove the URLs we've processed from the search URLs queue
    stateCopy.searchUrls = stateCopy.searchUrls.filter((urlObj) => {
      // Check if this URL is in the batch of processed URLs
      const isInBatch = Array.from(processedUrlsInThisBatch).some(
        (url) => url === urlObj.url
      );
      return !isInBatch;
    });

    // Check if we have more jobs to fetch
    hasMore = stateCopy.searchUrls.length > 0;

    // Return results
    return {
      jobs: jobResults,
      hasMore,
      nextSearchState: stateCopy,
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
    progressCallback?: (progress: {
      current: number;
      total: number;
      status: string;
      jobs?: JobListing[];
      percentage?: number;
    }) => void,
    options: {
      pageSize?: number; // Number of jobs per page (default: 20)
      maxInitialJobs?: number; // Maximum jobs for initial response (default: 50)
      searchDepth?: number; // Number of pages to search (default: 2)
      continueToken?: string; // Token to resume search
      workplace?: "remote" | "hybrid" | "any"; // Workplace preference
      remote?: boolean; // Explicit remote flag (true = remote only, false = on-site/hybrid)
    } = {}
  ): Promise<{
    jobs: JobListing[];
    continueToken?: string; // Token to get more results
    hasMore: boolean; // Whether more results are available
  }> {
    try {
      // Default options with increased job limits
      const {
        pageSize = 20,
        maxInitialJobs = 50, // Increased from 30 to 50
        searchDepth = 3, // Increased from 1 to 3 to search more pages
        continueToken,
        workplace = "any", // Default to any workplace type
        remote, // Undefined by default (let Workable use their default)
      } = options;

      console.log(
        `Getting Workable jobs for user ID: ${userId} with options:`,
        JSON.stringify({
          pageSize,
          maxInitialJobs,
          searchDepth,
          hasContinueToken: !!continueToken,
          workplace,
          remote,
        })
      );

      // Get or resume search state
      let searchState: SearchState;

      if (continueToken) {
        // Resume search from where we left off
        const savedState = await this.getSearchState(continueToken);
        if (!savedState) {
          console.warn(`Search state not found for token: ${continueToken}`);
          // Start a new search if the token is invalid
          const userProfile = await storage.getUserProfile(userId);
          searchState = this.initializeSearchState(
            userProfile || null,
            searchDepth
          );
        } else {
          searchState = savedState;
          console.log(
            `Resuming search with token: ${continueToken} (${savedState.searchUrls.length} URLs in queue)`
          );

          // Report any priority changes that may have happened
          if (savedState.searchUrls.length > 0) {
            // Get top 3 URLs by priority
            const topUrls = [...savedState.searchUrls]

              .sort((a, b) => b.priority - a.priority)
              .slice(0, 3);

            console.log(`Top priority URLs in resumed search:`);
            topUrls.forEach((urlObj, i) => {
              console.log(
                `  ${i + 1}. ${urlObj.url.substring(
                  0,
                  60
                )}... (priority: ${urlObj.priority.toFixed(2)})`
              );
            });
          }
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
            hasMore: false,
          };
        }

        // Initialize a new search state with workplace preferences
        searchState = this.initializeSearchState(userProfile, searchDepth);

        // Add the workplace preferences to each search URL
        if (workplace) {
          // Update the search URLs with the workplace parameter
          searchState.searchUrls = searchState.searchUrls.map((urlObj) => {
            const url = new URL(urlObj.url);

            // Remove any existing workplace parameter if present
            url.searchParams.delete("workplace");

            // Add the appropriate workplace parameter based on user's preference
            if (workplace === "remote") {
              url.searchParams.append("workplace", "remote");
            } else if (workplace === "hybrid") {
              url.searchParams.append("workplace", "hybrid");
            }
            // For 'any', we don't add a workplace parameter

            return {
              url: url.toString(),
              priority: urlObj.priority,
            };
          });
        }

        // Log initial search state
        if (searchState.searchUrls.length > 0) {
          console.log(
            `Initial search with ${searchState.searchUrls.length} URLs`
          );
          searchState.searchUrls.slice(0, 3).forEach((urlObj, i) => {
            console.log(
              `  ${i + 1}. ${urlObj.url} (priority: ${urlObj.priority.toFixed(
                2
              )})`
            );
          });
        }
      }

      // Execute batch search with progress updates
      const result = await this.executeBatchedSearch(searchState, {
        maxJobs: maxInitialJobs,
        maxSearches: searchDepth,
        progressCallback,
      });

      // Sort jobs by match score (if available)
      let sortedJobs: JobListing[] = result.jobs.sort((a, b) => {
        // Sort by match score (higher first)
        if (a.matchScore !== undefined && b.matchScore !== undefined) {
          return b.matchScore - a.matchScore;
        }
        return 0;
      });

      // Filter out jobs already applied to by the user (optimized deduplication)
      const appliedJobs = await storage.getJobs(userId);
      const appliedLinks = new Set(
        appliedJobs
          .filter(
            (j) =>
              (j.status && j.status.toLowerCase() === "applied") ||
              (j.applicationStatus &&
                ["applied", "submitted"].includes(
                  j.applicationStatus.toLowerCase()
                ))
          )
          .map((j) => j.link)
      );
      const appliedExternalIds = new Set(
        appliedJobs
          .filter(
            (j) =>
              (j.status && j.status.toLowerCase() === "applied") ||
              (j.applicationStatus &&
                ["applied", "submitted"].includes(
                  j.applicationStatus.toLowerCase()
                ))
          )
          .map((j) => j.externalJobId)
      );
      sortedJobs = sortedJobs.filter((job: JobListing) => {
        const linkMatch = job.applyUrl && appliedLinks.has(job.applyUrl);
        const idMatch =
          job.externalJobId && appliedExternalIds.has(job.externalJobId);
        return !linkMatch && !idMatch;
      });

      // Generate continue token if there are more results
      const newContinueToken = result.hasMore
        ? await this.saveSearchState(result.nextSearchState)
        : undefined;

      // Log result summary
      console.log(
        `Found ${sortedJobs.length} jobs ${
          newContinueToken ? "(more available)" : "(no more available)"
        }`
      );
      if (sortedJobs.length > 0) {
        console.log("Job details:");
        sortedJobs.slice(0, 3).forEach((job, i) => {
          console.log(
            `  ${i + 1}. ${job.jobTitle} at ${job.company}, Location: ${
              job.location
            }, Score: ${job.matchScore || "N/A"}`
          );
        });
      }

      // Return jobs and pagination info
      return {
        jobs: sortedJobs,
        continueToken: newContinueToken,
        hasMore: result.hasMore,
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
    const defaultJobTitles = [
      "software engineer",
      "web developer",
      "product manager",
    ];

    // For testing, return a collection of default Workable job URLs
    const defaultWorkableJobs = [
      {
        jobTitle: "Software Engineer",
        company: "Balto",
        description:
          "Software engineering position focusing on AI and machine learning applications.",
        applyUrl: "https://apply.workable.com/balto/j/9BE3FA1FB7/",
        location: "Remote",
        source: "workable",
        matchScore: 75,
      },
      {
        jobTitle: "Backend Developer",
        company: "Aptible",
        description:
          "Backend development role focusing on secure cloud infrastructure.",
        applyUrl: "https://apply.workable.com/aptible/j/6F85714800/",
        location: "Remote",
        source: "workable",
        matchScore: 70,
      },
    ];

    // Filter jobs to include only those with valid Workable application URLs
    const validWorkableJobs = defaultWorkableJobs.filter((job) =>
      this.isValidWorkableApplicationUrl(job.applyUrl)
    );

    console.log(
      `Found ${validWorkableJobs.length} valid default Workable jobs`
    );

    return validWorkableJobs;
  }
}

// Export a singleton instance
export const workableScraper = new WorkableScraper();

// Export the getWorkableJobsForUser function for backward compatibility with auto-apply-service
export const getWorkableJobsForUser = async (
  userId: number,
  progressCallback?: (progress: {
    current: number;
    total: number;
    status: string;
    jobs?: JobListing[];
  }) => void,
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
    console.error(
      "Error in getWorkableJobsForUser compatibility function:",
      error
    );
    return [];
  }
};
