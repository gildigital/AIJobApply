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
      
      // Fetch with browser-like headers
      const response = await fetch(String(url), {
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
      
      // Parse job details
      const jobDetails = parseWorkableJob(html, String(url));
      
      return res.json({
        success: true,
        url,
        job: jobDetails,
        htmlLength: html.length
      });
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