import { Express, Request, Response } from "express";

/**
 * Register test routes for direct HTML fetching
 */
export function registerDirectFetchTestRoutes(app: Express) {
  /**
   * Test route to fetch HTML directly from a URL
   * This is a simple test to ensure we can at least fetch content without Playwright
   */
  app.get("/api/test/direct-fetch", async (req: Request, res: Response) => {
    try {
      // Get URL from query or use default
      const url = req.query.url 
        ? String(req.query.url) 
        : "https://apply.workable.com/balto/j/9BE3FA1FB7/";
      
      // console.log(`Testing direct fetch with URL: ${url}`);
      
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
      
      // Return job details and truncated HTML
      return res.json({
        success: true,
        url,
        title,
        contentLength: html.length,
        htmlPreview: html.substring(0, 200)
      });
    } catch (error: any) {
      console.error("Direct fetch error:", error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });
}