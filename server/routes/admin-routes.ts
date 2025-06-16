import type { Express, Request, Response } from "express";
import { db } from "../db.js";

export function registerAdminRoutes(app: Express) {
  
  // Route to create the application_payloads table
  app.post("/api/admin/migrate/application-payloads", async (req: Request, res: Response) => {
    try {
      console.log("Creating application_payloads table...");
      
      // Create the application_payloads table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS application_payloads (
          id SERIAL PRIMARY KEY,
          queued_job_id INTEGER NOT NULL REFERENCES job_queue(id) ON DELETE CASCADE,
          payload TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      
      // Add index for efficient querying
      console.log("Adding index for queued_job_id...");
      await db.execute(`
        CREATE INDEX IF NOT EXISTS application_payloads_queued_job_id_idx 
        ON application_payloads(queued_job_id);
      `);
      
      console.log("✅ Application payloads table created successfully!");
      
      return res.json({
        success: true,
        message: "Application payloads table created successfully"
      });
      
    } catch (error) {
      console.error("❌ Error creating application payloads table:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Route to check table status
  app.get("/api/admin/tables/status", async (req: Request, res: Response) => {
    try {
      // Check if application_payloads table exists
      const result = await db.execute(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'application_payloads'
        );
      `);
      
      const tableExists = result.rows[0]?.exists || false;
      
      return res.json({
        success: true,
        tables: {
          application_payloads: {
            exists: tableExists,
            status: tableExists ? "✅ Ready" : "❌ Missing"
          }
        }
      });
      
    } catch (error) {
      console.error("Error checking table status:", error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
} 