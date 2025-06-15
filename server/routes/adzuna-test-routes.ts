import { Request, Response } from "express";
import { searchJobs } from "../services/job-scraper.js";
import { storage } from "../storage.js";
import { startAutoApply, getJobListingsForUser } from "../services/auto-apply-service.js";

/**
 * Test routes for Adzuna integration
 */

/**
 * Test Adzuna job search directly
 * GET /api/test/adzuna/search?userId=1&keywords=developer&location=remote&limit=10
 */
export async function testAdzunaSearch(req: Request, res: Response) {
  try {
    const { userId, keywords, location, limit } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: "userId parameter is required",
        example: "/api/test/adzuna/search?userId=1&keywords=developer&location=remote&limit=10"
      });
    }

    // Parse parameters
    const parsedUserId = parseInt(userId as string);
    const searchKeywords = keywords ? (keywords as string).split(',').map(k => k.trim()) : [];
    const searchLocation = (location as string) || "United States";
    const searchLimit = limit ? parseInt(limit as string) : 10;

    // console.log(`Testing Adzuna search for user ${parsedUserId}:`, {
      // keywords: searchKeywords,
      // location: searchLocation,
      // limit: searchLimit
    // });

    // Call the Adzuna search function
    const jobs = await searchJobs(parsedUserId, {
      keywords: searchKeywords.length > 0 ? searchKeywords : undefined,
      location: searchLocation,
      limit: searchLimit
    });

    res.json({
      success: true,
      message: `Found ${jobs.length} jobs from Adzuna`,
      params: {
        userId: parsedUserId,
        keywords: searchKeywords,
        location: searchLocation,
        limit: searchLimit
      },
      jobs: jobs.map(job => ({
        title: job.jobTitle,
        company: job.company,
        location: job.location,
        source: job.source,
        applyUrl: job.applyUrl,
        description: job.description.substring(0, 200) + "...",
        externalJobId: job.externalJobId
      }))
    });
  } catch (error) {
    console.error("Error in Adzuna test:", error);
    res.status(500).json({ 
      error: "Failed to test Adzuna search", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Test the integrated job search (Workable + Adzuna)
 * GET /api/test/adzuna/integrated?userId=1
 */
export async function testIntegratedJobSearch(req: Request, res: Response) {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        error: "userId parameter is required",
        example: "/api/test/adzuna/integrated?userId=1"
      });
    }

    const parsedUserId = parseInt(userId as string);
    
    // Check if user exists
    const user = await storage.getUser(parsedUserId);
    if (!user) {
      return res.status(404).json({ 
        error: `User ${parsedUserId} not found`,
        tip: "Create a user first or use an existing userId"
      });
    }

    // console.log(`Testing integrated job search for user ${parsedUserId}`);

    // Call the integrated job search
    const jobs = await getJobListingsForUser(parsedUserId);

    // Group jobs by source
    const workableJobs = jobs.filter(job => job.source === 'workable');
    const adzunaJobs = jobs.filter(job => job.source === 'adzuna');

    res.json({
      success: true,
      message: `Found ${jobs.length} total jobs (${workableJobs.length} Workable + ${adzunaJobs.length} Adzuna)`,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      },
      summary: {
        total: jobs.length,
        workable: workableJobs.length,
        adzuna: adzunaJobs.length
      },
      jobs: jobs.map(job => ({
        title: job.jobTitle,
        company: job.company,
        location: job.location,
        source: job.source,
        applyUrl: job.applyUrl,
        description: job.description.substring(0, 150) + "...",
        externalJobId: job.externalJobId,
        matchScore: job.matchScore
      }))
    });
  } catch (error) {
    console.error("Error in integrated job search test:", error);
    res.status(500).json({ 
      error: "Failed to test integrated job search", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Test auto-apply with Adzuna jobs included
 * POST /api/test/adzuna/auto-apply
 * Body: { "userId": 1, "dryRun": true }
 */
export async function testAutoApplyWithAdzuna(req: Request, res: Response) {
  try {
    const { userId, dryRun = true } = req.body;
    
    if (!userId) {
      return res.status(400).json({ 
        error: "userId is required in request body",
        example: { "userId": 1, "dryRun": true }
      });
    }

    // Check if user exists
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ 
        error: `User ${userId} not found`
      });
    }

    // console.log(`Testing auto-apply for user ${userId} (dryRun: ${dryRun})`);

    if (dryRun) {
      // For dry run, just get the jobs that would be processed
      const jobs = await getJobListingsForUser(userId);
      
      // Group by source
      const workableJobs = jobs.filter(job => job.source === 'workable');
      const adzunaJobs = jobs.filter(job => job.source === 'adzuna');
      
      res.json({
        success: true,
        dryRun: true,
        message: `Dry run completed. Would process ${jobs.length} jobs`,
        user: {
          id: user.id,
          name: user.name,
          isAutoApplyEnabled: user.isAutoApplyEnabled
        },
        summary: {
          total: jobs.length,
          workable: workableJobs.length,
          adzuna: adzunaJobs.length
        },
        sampleJobs: jobs.slice(0, 5).map(job => ({
          title: job.jobTitle,
          company: job.company,
          source: job.source,
          location: job.location,
          applyUrl: job.applyUrl
        })),
        note: "Set dryRun: false to actually start auto-apply"
      });
    } else {
      // Actually start auto-apply
      const result = await startAutoApply(userId);
      
      res.json({
        success: true,
        dryRun: false,
        message: result,
        user: {
          id: user.id,
          name: user.name,
          isAutoApplyEnabled: user.isAutoApplyEnabled
        },
        note: "Auto-apply process started. Check logs for progress."
      });
    }
  } catch (error) {
    console.error("Error in auto-apply test:", error);
    res.status(500).json({ 
      error: "Failed to test auto-apply", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * Test Adzuna API credentials and connectivity
 * GET /api/test/adzuna/health
 */
export async function testAdzunaHealth(req: Request, res: Response) {
  try {
    const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
    const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

    if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
      return res.status(500).json({
        success: false,
        error: "Adzuna API credentials not configured",
        missing: {
          ADZUNA_APP_ID: !ADZUNA_APP_ID,
          ADZUNA_APP_KEY: !ADZUNA_APP_KEY
        },
        note: "Set ADZUNA_APP_ID and ADZUNA_APP_KEY environment variables"
      });
    }

    // Test API connectivity with a simple search
    const testUrl = `https://api.adzuna.com/v1/api/jobs/us/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&results_per_page=1&what=test&content-type=application/json`;
    
    // console.log("Testing Adzuna API connectivity...");
    const response = await fetch(testUrl);
    
    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: `Adzuna API returned ${response.status}: ${response.statusText}`,
        credentials: {
          appId: ADZUNA_APP_ID ? "✓ Set" : "✗ Missing",
          appKey: ADZUNA_APP_KEY ? "✓ Set" : "✗ Missing"
        }
      });
    }

    const data = await response.json();
    
    res.json({
      success: true,
      message: "Adzuna API is accessible",
      credentials: {
        appId: "✓ Valid",
        appKey: "✓ Valid"
      },
      testResult: {
        status: response.status,
        resultsFound: data.count || 0
      }
    });
  } catch (error) {
    console.error("Error testing Adzuna health:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to test Adzuna API health", 
      details: error instanceof Error ? error.message : String(error)
    });
  }
}