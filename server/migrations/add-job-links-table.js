import { db } from "../db.js";

/**
 * Migration to add the job_links table for storing scraped job URLs before processing
 */
export async function runMigration() {
  try {
    // console.log("Creating job_links table...");
    
    // Create the job_links table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS job_links (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        url TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'workable',
        external_job_id TEXT,
        query TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'skipped')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ,
        priority REAL NOT NULL DEFAULT 1.0,
        error TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0
      );
    `);
    
    // Add unique constraint to prevent duplicate URLs for the same user
    // console.log("Adding unique constraint for user_id and url...");
    await db.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS job_links_user_url_unique 
      ON job_links(user_id, url);
    `);
    
    // Add index for efficient querying
    // console.log("Adding indexes for efficient querying...");
    await db.execute(`
      CREATE INDEX IF NOT EXISTS job_links_user_status_priority_idx 
      ON job_links(user_id, status, priority DESC);
    `);
    
    await db.execute(`
      CREATE INDEX IF NOT EXISTS job_links_external_job_id_idx 
      ON job_links(external_job_id);
    `);
    
    // console.log("Migration completed successfully");
    return { success: true, message: "Created job_links table with indexes and constraints" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, error: error.message };
  }
} 