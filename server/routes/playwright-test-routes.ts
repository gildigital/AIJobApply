import { Express, Request, Response } from "express";

/**
 * Register test routes for testing Playwright Worker functionality
 */
export function registerPlaywrightTestRoutes(app: Express) {
  /**
   * Test route to verify Playwright Worker functionality
   * Tests the worker by taking a screenshot of the provided URL
   */
  app.get("/api/test/playwright", async (req: Request, res: Response) => {
    try {
      // Get URL from query or use default
      const url = req.query.url ? String(req.query.url) : "https://www.google.com";
      
      // Check if Playwright worker URL is configured
      if (!process.env.VITE_PLAYWRIGHT_WORKER_URL) {
        return res.status(500).json({
          success: false,
          error: "Playwright worker URL is not configured"
        });
      }
      
      // Use Playwright worker to get content
      let playwrightUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL || '';
      
      // Ensure the URL has a protocol
      if (!playwrightUrl.startsWith('http://') && !playwrightUrl.startsWith('https://')) {
        playwrightUrl = `https://${playwrightUrl}`;
      }
      
      console.log(`Using Playwright worker.`);
      
      // Call the Playwright worker to take a screenshot
      const response = await fetch(`${playwrightUrl}/screenshot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          width: 1280,
          height: 800
        }),
      });
      
      // Check for playwright worker errors
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          success: false,
          error: `Playwright worker error: ${response.statusText}`,
          details: errorText
        });
      }
      
      // Get the screenshot data
      const data = await response.json();
      
      return res.json({
        success: true,
        url,
        screenshotUrl: data.screenshot,
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Playwright test error:", error);
      return res.status(500).json({
        success: false, 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
  
  /**
   * Special route for direct HTML content retrieval via Playwright
   * Uses a non-standard path pattern to avoid Vite interception
   */
  app.get("/app_direct/playwright/html", async (req: Request, res: Response) => {
    // Always set content type to JSON for this route
    res.setHeader('Content-Type', 'application/json');
    
    try {
      // Get URL from query or use default Workable URL
      const url = req.query.url ? 
        String(req.query.url) : 
        'https://apply.workable.com/balto/j/9BE3FA1FB7/';
      
      console.log(`Testing Playwright HTML retrieval with URL: ${url}`);
      
      // Check if Playwright worker URL is configured
      if (!process.env.VITE_PLAYWRIGHT_WORKER_URL) {
        return res.status(500).json({
          success: false,
          error: "Playwright worker URL is not configured"
        });
      }
      
      // Use Playwright worker to get HTML content
      let playwrightUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL || '';
      
      // Ensure the URL has a protocol
      if (!playwrightUrl.startsWith('http://') && !playwrightUrl.startsWith('https://')) {
        playwrightUrl = `https://${playwrightUrl}`;
      }
      
      console.log(`Using Playwright worker.`);
      
      // Call the Playwright worker to fetch HTML
      const response = await fetch(`${playwrightUrl}/content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          waitUntil: "networkidle"
        }),
      });
      
      // Check for playwright worker errors
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({
          success: false,
          error: `Playwright worker error: ${response.statusText}`,
          details: errorText
        });
      }
      
      // Get the HTML content
      const data = await response.json();
      const html = data.content;
      
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
      console.error("Playwright HTML retrieval error:", error);
      return res.status(500).json({
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });
}