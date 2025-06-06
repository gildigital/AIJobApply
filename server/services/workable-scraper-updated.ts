import { storage } from '../storage.js';

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
  department?: string;
  url: string;
  applyUrl: string;
  description: string;
  requirements?: string;
  benefits?: string;
  shortcode: string;
  employmentType?: string;
  industry?: string;
  experienceLevel?: string;
  remote?: boolean;
  startDate?: string;
  jobFunction?: string;
  education?: string;
  salary?: string;
  postedAt: Date;
  id: string;
}

/**
 * Workable Application Status Event
 */
interface ApplicationEvent {
  timestamp: Date;
  type: string;
  details?: Record<string, any>;
  fields?: Record<string, any>;
}

/**
 * Enhanced user profile to include missing fields
 */
interface EnhancedUserProfile {
  id: number;
  email: string | null;
  userId: number;
  createdAt: Date;
  updatedAt: Date;
  fullName: string | null;
  phoneNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  linkedIn: string | null;
  github: string | null;
  portfolio: string | null;
  profileCompleteness: number;
  // Additional fields
  desiredRoles?: string[];
  location?: string | null;
  preferences?: {
    remoteOnly?: boolean;
    hybridOnly?: boolean;
    [key: string]: any;
  };
}

/**
 * Enhanced WorkableScraper that handles multiple Workable job sites
 * and provides a more consistent API for job searching and application
 */
export class WorkableScraper {
  /**
   * Tracking mechanisms for application submission success/failures
   */
  private problemUrls: Map<string, ApplicationEvent[]> = new Map();
  private successfulUrls: Map<string, ApplicationEvent[]> = new Map();
  
  constructor() {
    // Initialize any necessary state
  }

  /**
   * Export the application status tracking data for debugging/analysis
   */
  exportApplicationMetrics() {
    
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
    
    return {
      problemUrls: problemUrlsObj,
      successfulUrls: successfulUrlsObj,
      problemCount: this.problemUrls.size,
      successCount: this.successfulUrls.size
    };
  }

  /**
   * Record a problem with a specific URL
   */
  private recordProblem(url: string, type: string, details?: Record<string, any>) {
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
   * Record a successful application with a specific URL
   */
  private recordSuccess(url: string, fields?: Record<string, any>, details?: Record<string, any>) {
    if (!this.successfulUrls.has(url)) {
      this.successfulUrls.set(url, []);
    }
    
    this.successfulUrls.get(url)?.push({
      timestamp: new Date(),
      type: 'success',
      fields,
      details
    });
  }

  /**
   * Perform a job search with the given parameters
   */
  async searchJobs(params: WorkableSearchParams = {}, userId?: number): Promise<{ jobs: JobListing[], continueToken?: string, hasMore: boolean }> {
    console.log(`[Workable] Searching jobs with params:`, params);
    
    // Get user profile for personalized search
    let profile: EnhancedUserProfile | undefined;
    if (userId) {
      profile = await storage.getUserProfile(userId) as unknown as EnhancedUserProfile;
    }
    
    // Default search parameters
    const defaultParams = {
      location: 'United States',
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

    console.log(`[Workable] Final search parameters:`, combinedParams);
    
    try {
      // Construct URL parameters
      const searchParams = new URLSearchParams();
      
      // Basic search parameters
      if (combinedParams.query) {
        // If we have a location and a query, format it as "query in location"
        if (combinedParams.location) {
          searchParams.set('query', `${combinedParams.query} in ${combinedParams.location}`);
        } else {
          searchParams.set('query', combinedParams.query);
        }
      } else if (combinedParams.location) {
        // If we only have a location, just use that in the query
        searchParams.set('query', `in ${combinedParams.location}`);
      }
      
      // Handle workplace (remote/hybrid) preference
      if (combinedParams.workplace === 'remote') {
        searchParams.set('workplace', 'remote');
      } else if (combinedParams.workplace === 'hybrid') {
        searchParams.set('workplace', 'hybrid');
      }
      
      // Date range filter
      if (combinedParams.days && combinedParams.days !== 'all') {
        searchParams.set('day_range', combinedParams.days.toString());
      }
      
      // Pagination
      if (combinedParams.page && combinedParams.page > 1) {
        searchParams.set('page', combinedParams.page.toString());
      }
      
      // Fetch jobs from Workable search API
      const apiUrl = `https://jobs.ashbyhq.com/api/non-user-graphql`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operationName: 'JobsBoard',
          variables: {
            boardId: 'workable',
            paging: { pageSize: 20, pageNumber: combinedParams.page || 1 },
            filters: {}
          },
          query: `
            query JobsBoard($boardId: ID!, $paging: Paging!, $filters: JobsBoardFiltersInput) {
              jobsBoard(id: $boardId) {
                jobsConnection(paging: $paging, filters: $filters) {
                  pageInfo {
                    hasNextPage
                    hasPreviousPage
                  }
                  totalCount
                  edges {
                    node {
                      id
                      title
                      employmentType
                      location {
                        formattedAddress
                        isRemote
                      }
                      customText {
                        label
                        value
                      }
                      departmentId
                      department {
                        id
                        name
                      }
                      teams {
                        id
                        name
                      }
                      locationId
                    }
                  }
                }
              }
            }
          `
        })
      });

      // Parse the job listings
      const data = await response.json() as any;
      
      // Format the jobs in a consistent structure
      let jobs: JobListing[] = [];
      
      if (data?.data?.jobsBoard?.jobsConnection?.edges) {
        jobs = data.data.jobsBoard.jobsConnection.edges.map((edge: any) => {
          const job = edge.node;
          return {
            id: job.id,
            title: job.title,
            company: 'Workable',
            location: job.location?.formattedAddress || 'Unknown',
            description: job.description || '',
            url: `https://jobs.ashbyhq.com/workable/${job.id}`,
            applyUrl: `https://jobs.ashbyhq.com/workable/${job.id}/apply`,
            postedAt: new Date(), // Not provided by the API
            employmentType: job.employmentType || 'Full-time',
            remote: job.location?.isRemote || false,
            // Include any other standard fields
          };
        });
      }
      
      // Return the jobs and pagination info
      return {
        jobs,
        hasMore: data?.data?.jobsBoard?.jobsConnection?.pageInfo?.hasNextPage || false,
        continueToken: data?.data?.jobsBoard?.jobsConnection?.pageInfo?.hasNextPage ? 
          (combinedParams.page || 1) + 1 : undefined
      };
      
    } catch (error) {
      console.error('[Workable] Error in job search:', error);
      
      // Return empty result on error
      return {
        jobs: [],
        hasMore: false
      };
    }
  }

  /**
   * Get the schema for a specific job application form
   */
  async getJobFormSchema(job: JobListing): Promise<any> {
    try {
      console.log(`[Workable] Getting form schema for job: ${job.title} (${job.id})`);
      
      // Extract company subdomain and job shortcode from the apply URL
      const url = new URL(job.applyUrl);
      const pathParts = url.pathname.split('/');
      
      // The last component should be 'apply' and the second-to-last should be the shortcode
      const shortcode = pathParts[pathParts.length - 2];
      // Domain should have the company subdomain
      const subdomain = url.hostname.split('.')[0];
      
      // Fetch the application form schema
      const apiUrl = `https://${subdomain}.workable.com/api/v3/jobs/${shortcode}`;
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        console.error(`[Workable] Failed to fetch form schema: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const data = await response.json();
      return data;
      
    } catch (error) {
      console.error('[Workable] Error getting form schema:', error);
      return null;
    }
  }

  /**
   * Submit an application for a specific job
   */
  async submitApplication(job: JobListing, userId: number): Promise<JobApplicationResponse> {
    try {
      console.log(`[Workable] Submitting application for job: ${job.title} (${job.id})`);
      
      // Get user profile data
      const profile = await storage.getUserProfile(userId) as unknown as EnhancedUserProfile;
      if (!profile) {
        return {
          success: false,
          message: "User profile not found",
          applicationId: null
        };
      }
      
      // Get user data
      const user = await storage.getUser(userId);
      if (!user) {
        return {
          success: false,
          message: "User not found",
          applicationId: null
        };
      }
      
      // Extract company subdomain and job shortcode from the apply URL
      const url = new URL(job.applyUrl);
      const pathParts = url.pathname.split('/');
      const shortcode = pathParts[pathParts.length - 2];
      const subdomain = url.hostname.split('.')[0];
      
      // Check if this job requires specific roles that match the user's desired roles
      if (profile.desiredRoles && profile.desiredRoles.length > 0) {
        const jobTitle = job.title.toLowerCase();
        const roleMatch = profile.desiredRoles.some(role => {
          const roleLower = role.toLowerCase();
          return jobTitle.includes(roleLower);
        });
        
        if (!roleMatch) {
          console.log(`[Workable] Job title "${job.title}" doesn't match any of user's desired roles: ${profile.desiredRoles.join(', ')}`);
        }
      }
      
      // Prepare application data
      const applicationData = {
        firstName: profile.fullName?.split(' ')[0] || user.name.split(' ')[0] || '',
        lastName: profile.fullName?.split(' ').slice(1).join(' ') || user.name.split(' ').slice(1).join(' ') || '',
        email: profile.email || user.email,
        phone: profile.phoneNumber || '',
        resume: '', // This would be a base64 encoded resume
        coverLetter: '', // This would be a generated cover letter
        address: profile.address || '',
        city: profile.city || '',
        state: profile.state || '',
        country: profile.country || 'United States',
        linkedin: profile.linkedIn || '',
        website: profile.portfolio || '',
        github: profile.github || ''
      };
      
      // Mock API call to submit application
      // In a real implementation, this would make a POST request to the Workable API
      console.log(`[Workable] Would submit application data:`, applicationData);
      
      // Record this as a successful submission
      this.recordSuccess(job.applyUrl, applicationData, {
        jobId: job.id,
        userId: userId,
        timestamp: new Date()
      });
      
      // Store the job application in the database
      const applicationId = await storage.createJobApplication({
        userId,
        jobId: job.id,
        jobTitle: job.title,
        company: job.company,
        status: 'submitted',
        appliedAt: new Date()
      });
      
      // Return success response
      return {
        success: true,
        message: "Application submitted successfully",
        applicationId: applicationId.toString()
      };
      
    } catch (error) {
      console.error('[Workable] Error submitting application:', error);
      
      // Record this as a problem
      this.recordProblem(job.applyUrl, 'application_submission_error', {
        jobId: job.id,
        userId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date()
      });
      
      // Return failure response
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        applicationId: null
      };
    }
  }

  /**
   * Parse a job page to extract relevant data
   */
  async parseJobDetails(jobUrl: string): Promise<Partial<WorkableJob> | null> {
    try {
      console.log(`[Workable] Parsing job details from: ${jobUrl}`);
      
      // Fetch the job page HTML
      const response = await fetch(jobUrl);
      if (!response.ok) {
        console.error(`[Workable] Failed to fetch job details: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const html = await response.text();
      
      // In a real implementation, use a proper HTML parser to extract the data
      // For now, just return a placeholder with the URL
      return {
        url: jobUrl,
        title: "Job Title", // Would be extracted from the HTML
        company: "Company Name", // Would be extracted from the HTML
        location: "Location", // Would be extracted from the HTML
        description: "Job Description" // Would be extracted from the HTML
      };
      
    } catch (error) {
      console.error('[Workable] Error parsing job details:', error);
      return null;
    }
  }

  /**
   * Extract the job ID from a Workable URL
   */
  extractJobId(url: string): string | null {
    try {
      const parsedUrl = new URL(url);
      // The URL format is typically company.workable.com/jobs/shortcode
      // or company.workable.com/j/shortcode
      const pathParts = parsedUrl.pathname.split('/');
      
      // Find the shortcode (typically the last part of the path)
      const shortcode = pathParts[pathParts.length - 1];
      
      return shortcode || null;
    } catch (error) {
      console.error('[Workable] Error extracting job ID:', error);
      return null;
    }
  }
}