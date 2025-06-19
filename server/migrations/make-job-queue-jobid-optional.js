import { sql } from 'drizzle-orm';
import { db } from '../db.js';

/**
 * Migration: Make jobId optional in job_queue table
 * 
 * This allows queue entries to be created without a job tracker record,
 * and the job tracker record is only created when applications succeed.
 */
export async function runMigration() {
  try {
    console.log('Making job_id column nullable in job_queue table...');
    
    // Make jobId nullable
    await db.execute(sql`
      ALTER TABLE job_queue 
      ALTER COLUMN job_id DROP NOT NULL;
    `);
    
    console.log('Migration completed successfully');
    return { success: true, message: "Made job_id column nullable in job_queue table" };
  } catch (error) {
    console.error('Migration failed:', error);
    return { success: false, error: error.message };
  }
}

// Always run when this file is executed
// runMigration()
//   .then(() => process.exit(0))
//   .catch((error) => {
//     console.error('Migration failed:', error);
//     process.exit(1);
//   });
