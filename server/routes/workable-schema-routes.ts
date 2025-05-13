/**
 * Routes for testing the schema-driven Workable application approach
 */
import { Express, Request, Response } from "express";
import { workableScraper } from "../services/workable-scraper.js";
import { submitWorkableApplication } from "../services/workable-application.js";

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
      const result = await workableScraper.introspectJobForm(jobUrl);
      
      // If no result returned at all (e.g., network failure, etc.)
      if (!result) {
        return res.status(404).json({
          success: false,
          error: {
            message: "Failed to introspect job form",
            status: "Error",
            details: "The worker was unable to analyze the form structure"
          }
        });
      }
      
      // Check if the result is already an error response
      if (result.success === false) {
        // We have an explicit error response from the service
        // Pass it through directly
        return res.status(404).json(result);
      }
      
      // This is a success response in either format
      return res.json({
        success: true,
        status: "success",
        message: "Job form introspection successful",
        formSchema: result.formSchema || { status: "success", fields: result.fields }
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
      // Include all required properties for the User type
      const testUser = {
        id: 999,
        username: "gilileo_test",
        password: "hashed_password_not_used_for_test",
        email: "gilileo.af@gmail.com",
        name: "Gilileo Test",
        firstName: "Gilileo", // Extended property
        lastName: "Test",     // Extended property
        phone: "555-123-4567", // Extended property
        location: "Remote",
        onboardingCompleted: true,
        isAdmin: false,
        dailyApplicationLimit: 5,
        stripeCustomerId: null,
        stripeSessionId: null,
        stripeSubscriptionId: null,
        isAutoApplyEnabled: false,
        subscriptionPlan: "FREE" as "FREE" | "two_weeks" | "one_month_silver" | "one_month_gold" | "three_months_gold",
        subscriptionRenewsAt: null,
        subscriptionStartDate: null,
        subscriptionEndDate: null,
        resumeText: "Software Engineer with experience in web development technologies.",
        userSummary: "Experienced software engineer looking for new opportunities.",
        aiTokensUsed: 0,
        remainingTokens: 1000,
        createdAt: new Date(),
        updatedAt: new Date()
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
      
      // Create a test profile with all required database fields
      const testProfile = {
        id: 999,
        userId: 999,
        email: "test@example.com",
        createdAt: new Date(),
        updatedAt: new Date(),
        fullName: "Gilileo Test",
        phoneNumber: "555-123-4567",
        address: "123 Tech Street",
        city: "San Francisco",
        state: "CA",
        zipCode: "94102",
        country: "USA",
        dateOfBirth: new Date("1990-01-01"),
        jobTitlesOfInterest: ["Software Engineer", "Full Stack Developer"],
        locationsOfInterest: ["San Francisco, CA", "Remote"],
        minSalaryExpectation: 120000,
        excludedCompanies: [],
        willingToRelocate: true,
        preferredWorkArrangement: ["full-time"],
        workplaceOfInterest: ["remote", "hybrid"],
        jobExperienceLevel: ["mid_senior_level"],
        activeSecurityClearance: false,
        clearanceDetails: "",
        matchScoreThreshold: 70,
        personalWebsite: "https://gilileo.dev",
        linkedinProfile: "https://linkedin.com/in/gilileo",
        githubProfile: "https://github.com/gilileo",
        portfolioLink: "https://gilileo.dev",
        profileCompleteness: 95,
        // Additional fields used in application that aren't part of the UserProfile type
        jobTitle: "Software Engineer" as any,
        skills: ["JavaScript", "TypeScript", "React", "Node.js", "Python", "C++", "C#", "Java", "SQL"] as any,
        education: [
          {
            institution: "University of Technology",
            degree: "Bachelor of Science in Computer Science",
            graduationYear: 2020
          }
        ] as any,
        workExperience: [
          {
            company: "Tech Solutions Inc.",
            role: "Software Engineer",
            startDate: "2020-01",
            endDate: "2023-06",
            description: "Developed web applications and APIs using modern technologies"
          }
        ] as any,
        onlinePresence: {
          linkedin: "https://linkedin.com/in/gilileo",
          github: "https://github.com/gilileo",
          portfolio: "https://gilileo.dev"
        } as any
      } as any;
      
      // Create a simple test resume (this is Base64 string of a tiny PDF)
      // Adding the missing properties required by ResumeWithContentType
      const testResume = {
        id: 999,
        userId: 999,
        filename: "test_resume.pdf",
        fileData: "JVBERi0xLjUKJbXtrvsKNSAwIG9iago8PCAvTGVuZ3RoIDYgMCBSCiAgIC9GaWx0ZXIgL0ZsYXRlRGVjb2RlCj4+CnN0cmVhbQp4nDPQM1QwNDJUKErlMtAzAEKFXK60osy81GIuADd5BWsKZW5kc3RyZWFtCmVuZG9iago2IDAgb2JqCiAgIDM2CmVuZG9iago0IDAgb2JqCjw8Cj4+CmVuZG9iagozIDAgb2JqCjw8CiAgIC9UeXBlIC9QYWdlCiAgIC9QYXJlbnQgMSAwIFIKICAgL01lZGlhQm94IFswIDAgMTAwIDEwMF0KICAgL0NvbnRlbnRzIDUgMCBSCiAgIC9Hcm91cCA8PCAvVHlwZSAvR3JvdXAKICAgICAgICAgICAgICAvUyAvVHJhbnNwYXJlbmN5CiAgICAgICAgICAgICAgL0kgdHJ1ZQogICAgICAgICAgICAgIC9DUyAvRGV2aWNlUkdCCiAgICAgICAgICA+Pgo+PgplbmRvYmoKMSAwIG9iago8PCAvVHlwZSAvUGFnZXMKICAgL0tpZHMgWyAzIDAgUiBdCiAgIC9Db3VudCAxCj4+CmVuZG9iagoyIDAgb2JqCjw8IC9UeXBlIC9DYXRhbG9nCiAgIC9QYWdlcyAxIDAgUgo+PgplbmRvYmoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwNDcxIDAwMDAwIG4gCjAwMDAwMDA1MzAgMDAwMDAgbiAKMDAwMDAwMDIwMyAwMDAwMCBuIAowMDAwMDAwMTgyIDAwMDAwIG4gCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDEyOSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDcKICAgL1Jvb3QgMiAwIFIKICAgL0lEIFsgPGExMGQ0MGU4NmZkNTBkNDJlMmRlYzRlMGYwZmNlYTY3PiA8YTEwZDQwZTg2ZmQ1MGQ0MmUyZGVjNGUwZjBmY2VhNjc+IF0KICAgL0luZm8gNCAwIFIKPj4Kc3RhcnR4cmVmCjU3OQolJUVPRgo=",
        fileType: "application/pdf",
        createdAt: new Date(),
        updatedAt: new Date(),
        // Adding missing properties
        parsedText: "This is a sample resume text for testing",
        uploadedAt: new Date()
      };
    
      // Use the schema-driven approach to submit the application
      const result = await submitWorkableApplication(
        testUser,
        testResume, // add a test resume
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