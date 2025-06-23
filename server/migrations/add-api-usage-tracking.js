/**
 * Migration: Add API usage tracking table
 * 
 * This table will track API usage per user for analytics and billing purposes.
 */

import { db } from "../db.js";

export async function up(db) {
  // Create the api_usage table
  await db.sql`
    CREATE TABLE IF NOT EXISTS api_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      api_provider TEXT NOT NULL, -- 'openai' or 'anthropic'
      api_model TEXT NOT NULL, -- e.g., 'gpt-4o-2024-08-06', 'claude-3-7-sonnet'
      operation TEXT NOT NULL, -- e.g., 'job_matching', 'resume_analysis'
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      estimated_cost_cents INTEGER, -- Cost in cents for easier calculations
      response_time_ms INTEGER,
      success BOOLEAN NOT NULL DEFAULT true,
      error_message TEXT,
      metadata JSONB, -- Store additional context like jobId, matchScore, etc.
      timestamp TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;

  // Create indexes for better query performance
  await db.sql`
    CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
  `;
  
  await db.sql`
    CREATE INDEX IF NOT EXISTS idx_api_usage_timestamp ON api_usage(timestamp);
  `;
  
  await db.sql`
    CREATE INDEX IF NOT EXISTS idx_api_usage_user_date ON api_usage(user_id, timestamp);
  `;
}

export async function down(db) {
  // Drop the table and indexes
  await db.sql`DROP TABLE IF EXISTS api_usage CASCADE;`;
}

/**
 * Run the migration automatically
 */
export async function runMigration() {
  console.log("🚀 Running API usage tracking migration...");
  try {
    await up(db);
    console.log("✅ API usage tracking table created successfully!");
  } catch (error) {
    if (error.message && error.message.includes('already exists')) {
      console.log("ℹ️  API usage tracking table already exists, skipping...");
    } else {
      throw error;
    }
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