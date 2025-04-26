import { Express, Request, Response } from "express";

/**
 * Register test routes for verifying environment variables
 */
export function registerEnvTestRoutes(app: Express) {
  /**
   * Test route to check environment variables
   */
  app.get("/server-only/test/env", async (req: Request, res: Response) => {
    try {
      // Only return the names of environment variables for security
      const envVars = Object.keys(process.env).reduce((acc, key) => {
        const value = process.env[key] || null;
        // Mask sensitive values
        const isSensitive = key.includes('KEY') || 
                           key.includes('SECRET') || 
                           key.includes('PASSWORD') ||
                           key.includes('TOKEN');
        
        acc[key] = isSensitive ? 
          (value ? `${value.slice(0, 3)}...${value.slice(-3)}` : null) : 
          (value || null);
        
        return acc;
      }, {} as Record<string, string | null>);
      
      res.json({
        success: true,
        env: envVars,
        // Specifically verify the PLAYWRIGHT_WORKER_URL
        playwright_worker: {
          url: process.env.PLAYWRIGHT_WORKER_URL,
          formatted: process.env.PLAYWRIGHT_WORKER_URL ? 
            `https://${process.env.PLAYWRIGHT_WORKER_URL}`.replace(/^https:\/\/https:\/\//, 'https://') : 
            null
        }
      });
    } catch (error) {
      console.error("Error in env test route:", error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}