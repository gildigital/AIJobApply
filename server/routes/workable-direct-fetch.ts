import { Express, Request, Response } from "express";

/**
 * Register direct fetch route for Workable jobs
 */
export function registerWorkableDirectFetch(app: Express) {
  /**
   * Test endpoint that fetches a Workable job directly
   */
  app.get("/api/workable/direct-fetch", async (req: Request, res: Response) => {
    try {
      // Get URL from query
      const url = req.query.url;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: "URL parameter is required"
        });
      }
      
      console.log(`Fetching Workable job from URL: ${url}`);
      
      // Get the playwright worker URL from environment
      const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
      if (!workerUrl) {
        console.error("No playwright worker URL configured (VITE_PLAYWRIGHT_WORKER_URL)");
        
        // Fallback to the old HTML parsing method
        return await fallbackDirectFetch(String(url), res);
      }
      
      try {
        // Use the new scrapeJobDescription endpoint
        console.log(`Calling playwright worker at ${workerUrl}/scrapeJobDescription`);
        const workerResponse = await fetch(`${workerUrl}/scrapeJobDescription`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: String(url) }),
          // Timeout for the worker call
          signal: AbortSignal.timeout(70000) // 70 second timeout - longer than worker queue timeout
        });
        
        if (!workerResponse.ok) {
          console.error(`Playwright worker responded with status ${workerResponse.status}`);
          throw new Error(`Worker responded with status ${workerResponse.status}`);
        }
        
        const workerData = await workerResponse.json();
        
        if (workerData.success && workerData.description && workerData.description !== "No description available") {
          // Successfully got job description from worker
          console.log(`Successfully extracted job description (${workerData.description.length} characters)`);
          
          return res.json({
            success: true,
            url,
            job: {
              title: workerData.title,
              company: workerData.company,
              location: workerData.location,
              description: workerData.description,
              url: String(url),
              isRemote: workerData.isRemote,
              jobType: null,
              deadline: null,
              source: 'workable',
              appliedAt: null,
              status: 'found'
            },
            htmlLength: workerData.description.length,
            timestamp: workerData.timestamp
          });
        } else {
          console.warn("Playwright worker couldn't extract job description, falling back to HTML parsing");
          throw new Error("Worker couldn't extract job description");
        }
        
      } catch (workerError) {
        console.error("Error calling playwright worker:", workerError);
        console.log("Falling back to direct HTML parsing");
        
        // Fallback to the old method
        return await fallbackDirectFetch(String(url), res);
      }
      
    } catch (error: any) {
      console.error("Workable direct fetch error:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}

/**
 * Fallback method that fetches HTML directly and tries to parse it
 */
async function fallbackDirectFetch(url: string, res: Response) {
  try {
    console.log("Using fallback HTML parsing method");
    
    // Fetch with browser-like headers
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    // Check if fetch was successful
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: `Failed to fetch job: ${response.statusText}`,
        status: response.status
      });
    }
    
    // Get HTML content
    const html = await response.text();
    
    // Parse job details using the original parsing logic
    const jobDetails = parseWorkableJob(html, url);
    
    return res.json({
      success: true,
      url,
      job: jobDetails,
      htmlLength: html.length,
      method: 'fallback-html-parsing'
    });
  } catch (error: any) {
    console.error("Fallback direct fetch error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      method: 'fallback-html-parsing'
    });
  }
}

/**
 * Parse a Workable job page HTML to extract job details
 */
function parseWorkableJob(html: string, url: string) {
  // Extract title
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const fullTitle = titleMatch ? titleMatch[1] : 'Unknown Job';
  
  // Clean up title - Workable titles have " - Company Name" at the end
  const titleParts = fullTitle.split(' - ');
  const title = titleParts.length > 1 ? titleParts[0].trim() : fullTitle;
  
  // Extract company name from URL (e.g., https://apply.workable.com/company-name/...)
  const urlParts = new URL(url).pathname.split('/');
  const company = urlParts.length > 1 ? urlParts[1] : 'Unknown';
  
  // Try to extract company name from title if available
  const companyFromTitle = titleParts.length > 1 ? titleParts[titleParts.length - 1].trim() : null;
  
  // Extract job description - try multiple potential selectors
  let description = '';
  
  // Try main job description container
  const jobDetailsMatch = html.match(/<div[^>]*class="[^"]*job-details[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (jobDetailsMatch && jobDetailsMatch[1]) {
    description = jobDetailsMatch[1].trim();
  }
  
  // If that fails, try job-description specific class
  if (!description) {
    const descriptionMatch = html.match(/<div[^>]*class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (descriptionMatch && descriptionMatch[1]) {
      description = descriptionMatch[1].trim();
    }
  }
  
  // If still no description, try to find any content in the details section
  if (!description) {
    const contentMatch = html.match(/<div[^>]*class="[^"]*details-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (contentMatch && contentMatch[1]) {
      description = contentMatch[1].trim();
    }
  }
  
  // Extract location - try multiple potential selectors
  let location = 'Remote';
  
  // Try location class
  const locationMatch = html.match(/<p[^>]*class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
  if (locationMatch && locationMatch[1]) {
    location = locationMatch[1].trim();
  }
  
  // Try metadata section
  if (location === 'Remote') {
    const metaLocationMatch = html.match(/<span[^>]*class="[^"]*meta[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    if (metaLocationMatch && metaLocationMatch[1] && metaLocationMatch[1].includes(',')) {
      location = metaLocationMatch[1].trim();
    }
  }
  
  // Try to extract application deadline if present
  let deadline = null;
  const deadlineMatch = html.match(/deadline[:\s]*([^<]+)</i);
  if (deadlineMatch && deadlineMatch[1]) {
    deadline = deadlineMatch[1].trim();
  }
  
  // Try to extract job type (full-time, part-time, etc.)
  let jobType = null;
  const jobTypeMatch = html.match(/job type[:\s]*([^<]+)</i);
  if (jobTypeMatch && jobTypeMatch[1]) {
    jobType = jobTypeMatch[1].trim();
  }
  
  // Try to determine if the job is remote by keywords in description or location
  const isRemote = location.toLowerCase().includes('remote') || 
                  (description && description.toLowerCase().includes('remote'));
  
  return {
    title, 
    company: companyFromTitle || company,
    location,
    description: description || 'No description available',
    url,
    isRemote,
    jobType,
    deadline,
    source: 'workable',
    appliedAt: null,
    status: 'found'
  };
}