import { Express, Request, Response } from "express";
import { workableScraper } from "../services/workable-scraper.js";
import { storage } from "../storage.js";

/**
 * Register test routes for Workable job scraper
 */
export function registerWorkableTestRoutes(app: Express) {
  /**
   * Test route to fetch Workable jobs for a user
   * This endpoint is for testing only and should be removed in production
   * NOTE: This route bypasses authentication for testing purposes
   */
  app.get("/server-only/test/workable-jobs", async (req: Request, res: Response) => {
    try {
      // Default to user ID 1 for testing
      const userId = Number(req.query.userId) || 1;
      
      // For test routes, create a test user profile if it doesn't exist
      let userProfile = await storage.getUserProfile(userId);
      
      if (!userProfile) {
        console.log(`Creating test user profile for user ID: ${userId}`);
        try {
          // Create a minimal test profile with proper types
          userProfile = await storage.createUserProfile({
            userId,
            // Using object properties that match the expected schema
            jobTitlesOfInterest: ['Software Engineer', 'Frontend Developer', 'Full Stack Developer'] as any,
            locationsOfInterest: ['Remote', 'San Francisco, CA'] as any, 
            preferredWorkArrangement: 'remote' as any,
            willingToRelocate: false
          });
          console.log('Created test user profile');
        } catch (err) {
          console.error('Failed to create test user profile:', err);
        }
      }
      
      const jobsResult = await workableScraper.getWorkableJobsForUser(userId);
      
      res.json({
        success: true,
        userId,
        userProfile,
        jobCount: jobsResult.jobs.length,
        jobs: jobsResult.jobs
      });
    } catch (error) {
      console.error("Error in workable-jobs test route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Test route to generate Workable search URLs
   * Allows testing URL generation with different parameters
   * NOTE: This route bypasses authentication for testing purposes
   */
  app.get("/server-only/test/workable-search", async (req: Request, res: Response) => {
    try {
      const { query, location, remote } = req.query;
      
      // Convert remote query parameter to boolean
      const remoteValue = remote === 'true' ? true : 
                         remote === 'false' ? false : 
                         undefined;
      
      // Days parameter, default to 30
      const days = req.query.days ? 
                  Number(req.query.days) as 1 | 3 | 7 | 14 | 30 | 'all' : 
                  30;
      
      // Generate the search URL
      const searchUrl = workableScraper.buildSearchUrl(null, {
        query: query as string,
        location: location as string,
        remote: remoteValue,
        days
      });
      
      res.json({
        success: true,
        searchUrl,
        params: {
          query,
          location,
          remote: remoteValue,
          days
        }
      });
    } catch (error) {
      console.error("Error in workable-search test route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Test route to directly use the Playwright Worker
   * This is a diagnostic endpoint to troubleshoot Playwright integration
   */
  app.get("/server-only/test/playwright-workable", async (req: Request, res: Response) => {
    try {
      const url = req.query.url as string || "https://jobs.workable.com/search?query=software+engineer";
      const debug = req.query.debug === 'true';
      
      if (!process.env.VITE_PLAYWRIGHT_WORKER_URL) {
        return res.status(500).json({
          success: false,
          error: "VITE_PLAYWRIGHT_WORKER_URL environment variable not set"
        });
      }
      
      // Debug mode - just return environment variable value
      if (debug) {
        return res.json({
          success: true,
          playwright_worker_url: process.env.VITE_PLAYWRIGHT_WORKER_URL,
          message: "Debug mode - not making actual request"
        });
      }
      
      // Construct the request to send to the Playwright Worker
      // Make sure we have a proper URL with protocol
      const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL || '';
      const baseUrl = workerUrl.startsWith('http') ? workerUrl : `https://${workerUrl}`;
      // Try different potential endpoint paths
      const fullUrl = `${baseUrl}/api/screenshot`;
      
      console.log(`Sending screenshot request to Playwright Worker at: ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
      });
      
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Playwright worker returned status ${response.status}`,
          details: await response.text()
        });
      }
      
      const data = await response.json();
      
      res.json({
        success: true,
        url,
        playwrightUrl: fullUrl,
        screenshotTaken: !!data.screenshot,
        screenshotLength: data.screenshot ? data.screenshot.length : 0
      });
    } catch (error) {
      console.error("Error in playwright-workable test route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Simple test route to fetch HTML directly from Workable
   * This is a diagnostic endpoint to troubleshoot HTML structure
   */
  app.get("/server-only/test/simple-workable", async (req: Request, res: Response) => {
    try {
      const url = req.query.url as string || "https://apply.workable.com/balto/j/9BE3FA1FB7/";
      
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Failed to fetch from Workable: ${response.statusText}`
        });
      }
      
      const html = await response.text();
      
      res.json({
        success: true,
        url,
        htmlLength: html.length,
        htmlPreview: html.slice(0, 200)
      });
    } catch (error) {
      console.error("Error in simple-workable test route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  /**
   * Test route to find active Workable jobs
   * This is a helper endpoint to find current Workable job URLs for testing
   */
  app.get("/app_direct/workable/find-jobs", async (req: Request, res: Response) => {
    try {
      const query = req.query.query as string || "software engineer";
      const location = req.query.location as string || "remote";
      
      // Build the search URL
      const searchUrl = `https://jobs.workable.com/search?query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&remote=true`;
      
      console.log(`Searching for Workable jobs at: ${searchUrl}`);
      
      // Fetch the search results
      const response = await fetch(searchUrl);
      if (!response.ok) {
        return res.status(response.status).json({
          success: false,
          error: `Failed to fetch Workable jobs: ${response.statusText}`
        });
      }
      
      const html = await response.text();
      
      // Extract job links using a more general approach first
      let jobLinks: string[] = [];
      
      // First try to find any workable.com links
      const allWorkableLinks: string[] = [];
      const generalRegex = /https:\/\/[^"]+workable\.com\/[^"]+/g;
      let generalMatch;
      while ((generalMatch = generalRegex.exec(html)) !== null) {
        allWorkableLinks.push(generalMatch[0]);
      }
      
      console.log(`Found ${allWorkableLinks.length} workable.com links`);
      
      // Then specifically look for apply.workable.com/company/j/ links
      const applyRegex = /https:\/\/apply\.workable\.com\/[^\/]+\/j\/[^"]+/g;
      let applyMatch;
      while ((applyMatch = applyRegex.exec(html)) !== null) {
        jobLinks.push(applyMatch[0]);
      }
      
      // If we didn't find any specific job links, use a backup approach
      if (jobLinks.length === 0) {
        console.log("No direct job links found, using simplified approach");
        jobLinks = allWorkableLinks.filter(url => 
          url.includes('apply.workable.com') && 
          url.includes('/j/')
        );
      }
      
      // Get unique links
      const uniqueLinks = Array.from(new Set(jobLinks));
      
      // Let's also save a sample of the HTML for debugging
      const htmlSample = html.length > 1000 ? 
        html.substring(0, 500) + "..." + html.substring(html.length - 500) : 
        html;
      
      res.json({
        success: true,
        searchUrl,
        jobs: uniqueLinks.map(url => ({
          url,
          isValid: true
        }))
      });
    } catch (error) {
      console.error("Error in find-jobs route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Test route to simulate Workable job application using Playwright
   * This is a simpler version that just tests the connection to the Playwright worker
   * Uses app_direct path to bypass Vite's middleware interception
   */
  app.post("/app_direct/workable/submit", async (req: Request, res: Response) => {
    try {
      // Extract the job URL from the request
      const { jobUrl, userId } = req.body;
      
      if (!jobUrl) {
        return res.status(400).json({
          success: false,
          error: "Missing job URL in request"
        });
      }
      
      // Validate that this is a Workable job URL (we now support both the old and new formats)
      const { workableScraper } = await import("../services/workable-scraper");
      
      // Check for both direct application URLs and job listing URLs
      const isDirectAppUrl = workableScraper.isValidWorkableApplicationUrl(jobUrl);
      const isJobListingUrl = workableScraper.isValidWorkableJobUrl(jobUrl);
      
      if (!isDirectAppUrl && !isJobListingUrl) {
        return res.status(400).json({
          success: false,
          error: "Invalid Workable job URL",
          details: "URL must be either a Workable job listing URL (e.g., https://jobs.workable.com/view/ID/job-title) or a direct application URL (e.g., https://apply.workable.com/company/j/JOBID/)"
        });
      }
      
      // Indicate which flow we're using
      const urlType = isJobListingUrl ? "job-listing" : "direct-application";
      console.log(`Processing Workable ${urlType} URL: ${jobUrl}`);
      
      // Check if Playwright worker URL is configured
      if (!process.env.VITE_PLAYWRIGHT_WORKER_URL) {
        return res.status(500).json({
          success: false,
          error: "Playwright worker URL is not configured"
        });
      }
      
      // Build a more comprehensive test payload with the correct selectors for the Workable modal
      const testPayload = {
        user: {
          name: "Test User",
          email: "test@example.com",
          phone: "555-123-4567",
          firstName: "Test",
          lastName: "User",
          // Include more user fields to match what the worker might expect
          resumeText: "Software Engineer with experience in React, Node.js, and TypeScript",
        },
        // Add a resume object even if it's null
        resume: null,
        job: {
          applyUrl: jobUrl,
          source: "workable",
          jobTitle: "Software Engineer", // Add more job metadata
          company: "Test Company"
        },
        applicationData: {
          isWorkableJob: true,
          test: true,
          debugMode: true, // Request extra debugging info from the worker
          // Define selectors to find and click the "Apply Now" button
          applyButtonSelectors: [
            ".styles__apply-button--1v4Y8", // Main apply button class name
            "button.styles__button--3pqVh", // Generic button class
            "button[data-ui='apply-button']", // Button with data-ui attribute
            "button.styles__apply-button", // Alternative class pattern
            "button:has-text('Apply now')", // Text-based selector
            ".styles__actions--3aH9_ button", // Container + button
          ],
          // Define selectors for finding form fields in the modal
          formSelectors: {
            modal: [
              "dialog[aria-modal='true']", 
              ".styles__modal-wrapper--MS9An", 
              "[data-role='modal-wrapper']"
            ],
            firstName: [
              "input[name='first_name']",
              "input[name='firstName']",
              "input[placeholder*='first name' i]",
              "input[id*='first_name' i]"
            ],
            lastName: [
              "input[name='last_name']",
              "input[name='lastName']",
              "input[placeholder*='last name' i]",
              "input[id*='last_name' i]"
            ],
            email: [
              "input[name='email']",
              "input[type='email']",
              "input[placeholder*='email' i]"
            ],
            phone: [
              "input[name='phone']",
              "input[type='tel']",
              "input[placeholder*='phone' i]",
              "input[id*='phone' i]"
            ]
          },
          // Specify which form fields to attempt to fill
          formFields: {
            firstName: "Test",
            lastName: "User",
            email: "test@example.com",
            phone: "555-123-4567"
          },
          // Request a page screenshot for debugging if available
          captureScreenshot: true,
          // Try to capture form structure
          analyzeFormStructure: true,
          // Set a longer timeout for the form to appear
          modalWaitTimeMs: 5000
        }
      };
      
      // Use Playwright worker to submit the application
      const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL || '';
      const baseUrl = workerUrl.startsWith('http') ? workerUrl : `https://${workerUrl}`;
      const submitUrl = `${baseUrl}/submit`;
      
      console.log(`Sending test request to Playwright worker at: ${submitUrl}`);
      
      // Make the API request
      try {
        const response = await fetch(submitUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(testPayload)
        });
        
        // Process the response
        const statusCode = response.status;
        let responseText = await response.text();
        let responseData;
        
        try {
          // Try to parse the response as JSON
          responseData = JSON.parse(responseText);
        } catch (e) {
          // Not JSON, just use the text
          responseData = { text: responseText };
        }
        
        // Send appropriate response back to client
        if (response.ok) {
          return res.json({
            success: true,
            message: "Successfully connected to Playwright worker",
            statusCode,
            workerResponse: responseData
          });
        } else {
          return res.status(statusCode).json({
            success: false,
            message: "Playwright worker returned an error",
            statusCode,
            workerResponse: responseData
          });
        }
      } catch (fetchError) {
        return res.status(500).json({
          success: false,
          error: "Failed to connect to Playwright worker",
          details: fetchError instanceof Error ? fetchError.message : String(fetchError)
        });
      }
    } catch (error) {
      console.error("Error in workable-submit test route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}