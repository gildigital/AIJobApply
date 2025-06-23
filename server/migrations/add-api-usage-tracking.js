/**
 * Migration: Add API usage tracking table
 * 
 * This table will track API usage per user for analytics and billing purposes.
 */

import { db } from "../db.js";

/**
 * Migration to add API usage tracking table
 */
export async function runMigration() {
  try {
    console.log("Creating api_usage table...");
    
    // Create the api_usage table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS api_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        api_provider TEXT NOT NULL,
        api_model TEXT NOT NULL,
        operation TEXT NOT NULL,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        estimated_cost_cents INTEGER,
        response_time_ms INTEGER,
        success BOOLEAN NOT NULL DEFAULT true,
        error_message TEXT,
        metadata JSONB,
        timestamp TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    
    // Create indexes
    console.log("Adding indexes...");
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage(user_id, timestamp);`);
    
    console.log("Migration completed successfully");
    return { success: true, message: "Created api_usage table with indexes" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, error: error.message };
  }
}

// Always run when this file is executed
runMigration()
  .then(() => {
    console.log("✅ Migration successful! Now disable this file by commenting out the auto-run section.");
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  }); 