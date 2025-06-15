import { Express, Request, Response } from "express";

/**
 * Register a test route that ensures JSON response
 */
export function registerApiTestRoute(app: Express) {
  /**
   * This route explicitly sets headers to ensure we get JSON back
   */
  app.get("/app_direct/workable/test", async (req: Request, res: Response) => {
    // Explicitly set content type to JSON
    res.setHeader('Content-Type', 'application/json');
    
    try {
      // Get URL from query or use default Workable URL
      const url = req.query.url ? 
        String(req.query.url) : 
        'https://apply.workable.com/balto/j/9BE3FA1FB7/';
      
      // console.log(`Testing direct fetch API with URL: ${url}`);
      
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
        // console.log(`Fetch failed with status ${response.status}: ${response.statusText}`);
        return res.status(500).json({
          success: false,
          message: `Failed to fetch content: ${response.statusText}`,
          status: response.status
        });
      }
      
      // Get HTML content
      const html = await response.text();
      
      // Extract job details
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : 'No title found';
      
      // Return job details
      return res.json({
        success: true,
        source: 'direct-fetch',
        url,
        title,
        contentLength: html.length,
        htmlPreview: html.substring(0, 200)
      });
    } catch (error: any) {
      console.error("API test error:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}