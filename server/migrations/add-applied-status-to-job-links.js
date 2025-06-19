import { db } from "../db.js";

/**
 * Migration to add 'applied' status to job_links table enum
 */
export async function runMigration() {
  try {
    console.log("Adding 'applied' status to job_links table...");
    
    // Drop existing constraint and add new one with 'applied'
    await db.execute(`
      ALTER TABLE job_links 
      DROP CONSTRAINT IF EXISTS job_links_status_check;
    `);
    
    await db.execute(`
      ALTER TABLE job_links 
      ADD CONSTRAINT job_links_status_check 
      CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'skipped', 'applied'));
    `);
    
    console.log("✅ Successfully added 'applied' status to job_links table");
    return { success: true, message: "Added 'applied' status to job_links table" };
  } catch (error) {
    console.error("Migration failed:", error);
    return { success: false, error: error.message };
  }
}

// Always run when this file is executed
// runMigration()
//   .then(() => {
//     console.log("✅ Migration successful! Now disable this file by commenting out the auto-run section.");
//     process.exit(0);
//   })
//   .catch((error) => {
//     console.error('Migration failed:', error);
//     process.exit(1);
//   }); 