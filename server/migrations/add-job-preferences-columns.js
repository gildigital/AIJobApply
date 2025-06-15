// Add new columns to the user_profiles table for better job search filtering
import { sql } from 'drizzle-orm';
import { db } from '../db.js';

export async function runMigration() {
  try {
    // console.log('Starting migration to add new job preferences columns...');
    
    // Add workplaceOfInterest column (array type)
    await db.execute(sql`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS workplace_of_interest TEXT[] DEFAULT '{}';
    `);
    // console.log('Added workplace_of_interest column');
    
    // Add jobExperienceLevel column (array type)
    await db.execute(sql`
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS job_experience_level TEXT[] DEFAULT '{}';
    `);
    // console.log('Added job_experience_level column');
    
    // Convert preferredWorkArrangement from string to array (keeping existing data)
    await db.execute(sql`
      -- First create a temporary column to store the array version
      ALTER TABLE user_profiles 
      ADD COLUMN IF NOT EXISTS preferred_work_arrangement_temp TEXT[] DEFAULT '{}';
      
      -- Update the temp column with the existing values wrapped in arrays
      UPDATE user_profiles 
      SET preferred_work_arrangement_temp = ARRAY[preferred_work_arrangement]
      WHERE preferred_work_arrangement IS NOT NULL;
      
      -- Drop the original column
      ALTER TABLE user_profiles 
      DROP COLUMN IF EXISTS preferred_work_arrangement;
      
      -- Rename the array column to the original name
      ALTER TABLE user_profiles 
      RENAME COLUMN preferred_work_arrangement_temp TO preferred_work_arrangement;
    `);
    // console.log('Converted preferred_work_arrangement to array type');
    
    // console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this script is executed directly
if (import.meta.url === import.meta.main) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}