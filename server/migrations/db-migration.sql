-- Add workplaceOfInterest column (array type)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS workplace_of_interest TEXT[] DEFAULT '{}';

-- Add jobExperienceLevel column (array type)
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS job_experience_level TEXT[] DEFAULT '{}';

-- Convert preferredWorkArrangement from string to array (keeping existing data)
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