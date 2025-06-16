import { db } from "../db.js";

/**
 * Migration to add the application_payloads table for storing job application data
 * in the async queue system
 */
export async function runMigration() {
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
    
    console.log("Migration completed successfully");
    return { success: true, message: "Created application_payloads table with index" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, error: error.message };
  }
} 