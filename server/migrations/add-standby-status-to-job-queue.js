import { db } from "../db.js";

/**
 * Migration to add the 'standby' status to job_queue table and add updated_at column
 */
export async function runMigration() {
  try {
    // console.log("Adding 'standby' status to job_queue status enum...");
    
    // Add the standby status type to the enum
    await db.execute(`
      ALTER TABLE job_queue
      ALTER COLUMN status TYPE TEXT;
    `);
    
    // Add the updatedAt column if it doesn't exist
    // console.log("Adding 'updated_at' column to job_queue table...");
    await db.execute(`
      ALTER TABLE job_queue
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
    
    // console.log("Migration completed successfully");
    return { success: true, message: "Added standby status and updated_at column to job_queue table" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, error: error.message };
  }
}