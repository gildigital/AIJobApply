/**
 * Routes for testing the schema-driven Workable application approach
 */
import { Express, Request, Response } from "express";
import { workableScraper } from "../services/workable-scraper";
import { submitWorkableApplication } from "../services/workable-application";

/**
 * Register routes for testing the schema-driven Workable application approach
 */
export function registerWorkableSchemaRoutes(app: Express) {
  /**
   * Test introspection - analyze a Workable job application form
   * This endpoint will attempt to introspect the form structure
   */
  app.post("/api/test/workable/introspect", async (req: Request, res: Response) => {
    try {
      const { jobUrl } = req.body;
      
      if (!jobUrl) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing jobUrl in request body" 
        });
      }
      
      // Validate that it's a Workable job URL
      if (!workableScraper.isValidWorkableJobUrl(jobUrl) && !workableScraper.isValidWorkableApplicationUrl(jobUrl)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid Workable job URL" 
        });
      }
      
      console.log(`Processing Workable job-listing URL: ${jobUrl}`);
      
      // Perform introspection on the job's application form
      const formSchema = await workableScraper.introspectJobForm(jobUrl);
      
      if (!formSchema) {
        return res.status(404).json({
          success: false,
          error: "Failed to introspect job form",
          message: "The worker was unable to analyze the form structure"
        });
      }
      
      return res.json({
        success: true,
        message: "Job form introspection successful",
        formSchema
      });
    } catch (error) {
      console.error("Error in Workable introspect test route:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  /**
   * Test submission - attempt to submit an application using the schema-driven approach
   */
  app.post("/api/test/workable/submit", async (req: Request, res: Response) => {
    try {
      const { jobUrl } = req.body;
      
      if (!jobUrl) {
        return res.status(400).json({ 
          success: false, 
          error: "Missing jobUrl in request body" 
        });
      }
      
      // Validate that it's a Workable job URL
      if (!workableScraper.isValidWorkableJobUrl(jobUrl) && !workableScraper.isValidWorkableApplicationUrl(jobUrl)) {
        return res.status(400).json({ 
          success: false, 
          error: "Invalid Workable job URL" 
        });
      }
      
      console.log(`Processing Workable job application for URL: ${jobUrl}`);
      
      // Create a test user with minimal data needed for application
      const testUser = {
        id: 999,
        name: "Gilileo",
        firstName: "Gilileo",
        lastName: "Test",
        email: "gilileo.af@gmail.com",
        phone: "555-123-4567"
      };
      
      // Create a simple test job listing
      const testJob = {
        jobTitle: "Software Engineer",
        company: "Test Company",
        description: "This is a test job description for testing the Workable application flow.",
        applyUrl: jobUrl,
        location: "Remote",
        source: "workable"
      };
      
      // Create a test profile
      const testProfile = {
        id: 999,
        userId: 999,
        jobTitle: "Software Engineer",
        skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "C++", "C#", "Java", "SQL"],
        education: [
          {
            institution: "University of Technology",
            degree: "Bachelor of Science in Computer Science",
            graduationYear: 2020
          }
        ],
        workExperience: [
          {
            company: "Tech Solutions Inc.",
            role: "Software Engineer",
            startDate: "2020-01",
            endDate: "2023-06",
            description: "Developed web applications and APIs using modern technologies"
          }
        ],
        onlinePresence: {
          linkedin: "https://linkedin.com/in/gilileo",
          github: "https://github.com/gilileo",
          portfolio: "https://gilileo.dev"
        }
      };
      
      // Use the schema-driven approach to submit the application
      const result = await submitWorkableApplication(
        testUser,
        null, // no resume for the test
        testProfile,
        testJob,
        85 // test match score
      );
      
      if (result === "success") {
        return res.json({
          success: true,
          message: "Application submitted successfully"
        });
      } else if (result === "skipped") {
        return res.json({
          success: false,
          skipped: true,
          message: "Application was skipped",
          reason: "The application may require fields we couldn't fill or the form was not compatible"
        });
      } else {
        return res.status(500).json({
          success: false,
          error: "Failed to submit application",
          message: "The worker encountered an error during submission"
        });
      }
    } catch (error) {
      console.error("Error in Workable submit test route:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}