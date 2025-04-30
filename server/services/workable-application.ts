/**
 * Workable Application Submission Service
 * 
 * This file implements the schema-driven approach for submitting applications
 * to Workable job postings through the following two-phase workflow:
 * 
 * 1. Phase 1: Introspect the form to understand what fields are required
 * 2. Phase 2: Prepare the data and submit the application
 */

import { workableScraper } from "./workable-scraper";
import type { JobListing } from "./auto-apply-service";
import { 
  generateApplicationAnswer, 
  generateCoverLetter as generateAICoverLetter,
  selectBestOptionWithAI
} from "../utils/application-ai-service";

/**
 * Submit a job application to Workable using the schema-driven approach
 * 
 * @param user The user submitting the application
 * @param resume The user's resume (if available)
 * @param profile The user's profile (if available)
 * @param job The Workable job to apply to
 * @param matchScore The calculated match score
 * @returns Result of the application attempt
 */
import type { User as BaseUser, UserProfile as BaseUserProfile, Resume } from "@shared/schema";

// Extended interfaces to handle possible missing properties in schema
interface User extends BaseUser {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

// Extended Resume interface to include content type
interface ResumeWithContentType extends Resume {
  contentType?: string;
}

// Extended UserProfile to handle additional properties
interface UserProfile extends BaseUserProfile {
  jobTitle?: string;
  skills?: string[];
  education?: Array<{
    institution: string;
    degree: string;
    graduationYear: number;
  }>;
  workExperience?: Array<{
    company: string;
    role: string;
    startDate: string;
    endDate?: string;
    description: string;
  }>;
  onlinePresence?: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
}

/**
 * Submit a job application to Workable using the schema-driven approach
 * 
 * @param user The user submitting the application
 * @param resume The user's resume (if available)
 * @param profile The user's profile (if available)
 * @param job The Workable job to apply to
 * @param matchScore The calculated match score
 * @returns Result of the application attempt
 */
export async function submitWorkableApplication(
  user: User,
  resume: ResumeWithContentType | undefined,
  profile: UserProfile | undefined,
  job: JobListing,
  matchScore: number
): Promise<"success" | "skipped" | "error"> {
  try {
    console.log(`Processing Workable application using schema-driven approach for ${job.jobTitle} at ${job.company}`);
    
    // Check if we have a worker URL configured
    const workerUrl = process.env.PLAYWRIGHT_WORKER_URL;
    if (!workerUrl) {
      console.error("No Playwright worker URL configured");
      return "error";
    }
    
    // Make sure the URL includes the protocol
    const completeWorkerUrl = workerUrl.startsWith('http') 
      ? workerUrl 
      : `https://${workerUrl}`;
    
    // Phase 1: Introspection - Get the schema of the form
    console.log(`Phase 1: Introspecting form structure for: ${job.applyUrl}`);
    const rawFormSchema = await workableScraper.introspectJobForm(job.applyUrl);
    
    // Handle the new nested structure from Patchright
    let fields = null;
    
    // Case 1: New structure with nested formSchema
    if (rawFormSchema?.formSchema?.fields && Array.isArray(rawFormSchema.formSchema.fields)) {
      fields = rawFormSchema.formSchema.fields;
      console.log(`Using new nested formSchema structure with ${fields.length} fields`);
    } 
    // Case 2: Legacy structure with direct fields array
    else if (rawFormSchema?.fields && Array.isArray(rawFormSchema.fields)) {
      fields = rawFormSchema.fields;
      console.log(`Using legacy formSchema structure with ${fields.length} fields`);
    }
    
    // Validate we have fields
    if (!fields || fields.length === 0) {
      console.error("Form introspection failed or returned no fields");
      return "skipped";
    }
    
    // Create a standardized formSchema for the rest of the function
    const formSchema = {
      fields: fields,
      status: "success"
    };
    
    console.log(`Introspection successful: Found ${formSchema.fields.length} form fields`);
    
    // Phase 2: Prepare data and submit application
    console.log(`Phase 2: Preparing form data for submission`);
    
    // Prepare the formData object based on the introspected schema
    const formData: Record<string, any> = {};
    
    // First, analyze what fields are required
    const requiredFields = formSchema.fields.filter((field: any) => field.required);
    console.log(`Found ${requiredFields.length} required fields out of ${formSchema.fields.length} total fields`);
    
    // Helper to check if we'll be able to satisfy the required fields
    const canSatisfyRequiredFields = requiredFields.every((field: any) => {
      // Handle potential null values for field name and label
      const fieldNameLower = (field.name || field.id || '').toLowerCase();
      const fieldLabelLower = (field.label || '').toLowerCase();
      
      // For file type fields, we need a resume
      if (field.type === 'file') {
        // Check if it's a resume upload field - we can only satisfy if we have a resume
        const isResumeField = fieldNameLower.includes('resume') || 
                             fieldNameLower.includes('cv') || 
                             fieldLabelLower.includes('resume') || 
                             fieldLabelLower.includes('cv');
        
        if (isResumeField) {
          // Only return false if we don't have a resume file
          if (!resume || !resume.fileData) {
            console.log(`Missing required resume file for field: ${field.name} (${field.label || 'no label'})`);
            return false;
          }
          return true;
        }
        
        // Log but don't fail just because we have an unknown file field
        // Some applications might have optional file uploads even if marked "required"
        console.log(`Unknown file field type required: ${field.name} (${field.label || 'no label'}) - will try to proceed anyway`);
        return true;
      }
      
      // For basic fields like name/email, we need these as a minimum
      if (field.required) {
        // We still need these basic fields from the user profile
        if ((fieldNameLower.includes('email') || fieldLabelLower.includes('email')) && !user.email) {
          console.log(`Missing required email field: ${field.name}`);
          return false;
        }
        
        // For name fields, ensure we at least have a name to split
        if ((fieldNameLower.includes('name') || fieldLabelLower.includes('name')) && 
            !user.name && !user.firstName && !user.lastName && 
            !(profile && profile.fullName)) {
          console.log(`Missing required name field: ${field.name}`);
          return false;
        }
      }
      
      // With our AI-powered field filling, we can handle most other field types now!
      return true;
    });
    
    if (!canSatisfyRequiredFields) {
      console.log("Cannot satisfy all required fields, skipping application");
      return "skipped";
    }
    
    // Now map our user data to the form fields
    for (const field of formSchema.fields) {
      // Handle potential null values in field properties
      const fieldName = field.name || field.id || `field_${Math.random().toString(36).substring(2, 10)}`;
      const fieldType = field.type || 'text';
      const fieldLabel = field.label || '';
      const fieldNameLower = (typeof fieldName === 'string' ? fieldName : '').toLowerCase();
      const fieldLabelLower = fieldLabel.toLowerCase();
      
      // Basic field mapping based on field name and label patterns
      if (fieldNameLower.includes('first_name') || 
          fieldNameLower.includes('firstname') || 
          fieldLabelLower.includes('first name')) {
        // Try to get first name from profile, then fallback to user object
        const fullName = profile?.fullName || user.name;
        formData[fieldName] = user.firstName || (fullName ? fullName.split(' ')[0] : '');
      }
      
      else if (fieldNameLower.includes('last_name') || 
               fieldNameLower.includes('lastname') || 
               fieldLabelLower.includes('last name')) {
        // Try to get last name from profile, then fallback to user object
        const fullName = profile?.fullName || user.name;
        formData[fieldName] = user.lastName || (fullName ? fullName.split(' ').slice(1).join(' ') : '');
      }
      
      else if (fieldNameLower.includes('full_name') || 
               fieldNameLower.includes('fullname') || 
               fieldLabelLower.includes('full name')) {
        // Full name field
        formData[fieldName] = profile?.fullName || user.name || '';
      }
      
      else if (fieldNameLower.includes('email') || fieldLabelLower.includes('email')) {
        // Email field - try profile first, then user
        formData[fieldName] = profile?.email || user.email;
      }
      
      else if (fieldNameLower.includes('phone') || 
               fieldLabelLower.includes('phone') || 
               fieldLabelLower.includes('mobile')) {
        // Phone field - try profile first, then user
        formData[fieldName] = profile?.phoneNumber || user.phone || '';
      }
      
      // Address fields from profile
      else if (fieldNameLower.includes('address') || fieldLabelLower.includes('address')) {
        formData[fieldName] = profile?.address || '';
      }
      
      else if (fieldNameLower.includes('city') || fieldLabelLower.includes('city')) {
        formData[fieldName] = profile?.city || '';
      }
      
      else if (fieldNameLower.includes('state') || fieldLabelLower.includes('state')) {
        formData[fieldName] = profile?.state || '';
      }
      
      else if (fieldNameLower.includes('zip') || 
               fieldNameLower.includes('postal') || 
               fieldLabelLower.includes('zip') || 
               fieldLabelLower.includes('postal')) {
        formData[fieldName] = profile?.zipCode || '';
      }
      
      // Online presence fields
      else if (fieldNameLower.includes('linkedin') || fieldLabelLower.includes('linkedin')) {
        formData[fieldName] = profile?.linkedinProfile || '';
      }
      
      else if (fieldNameLower.includes('website') || 
               fieldNameLower.includes('personal website') || 
               fieldLabelLower.includes('website') ||
               fieldLabelLower.includes('personal website')) {
        formData[fieldName] = profile?.personalWebsite || '';
      }
      
      else if (fieldNameLower.includes('github') || fieldLabelLower.includes('github')) {
        formData[fieldName] = profile?.githubProfile || '';
      }
      
      else if (fieldNameLower.includes('portfolio') || fieldLabelLower.includes('portfolio')) {
        formData[fieldName] = profile?.portfolioLink || '';
      }
      
      // Special handling for files 
      else if (fieldType === 'file') {
        // Resume/CV files
        if (fieldNameLower.includes('resume') || 
            fieldNameLower.includes('cv') || 
            fieldLabelLower.includes('resume') || 
            fieldLabelLower.includes('cv')) {
          if (resume && resume.fileData) {
            formData[fieldName] = resume.fileData; // Base64 content - the worker knows how to handle this
          }
        } 
        // For other file types, we skip them in the formData but don't fail the whole application
        else {
          console.log(`Skipping non-resume file field: ${fieldName} (${fieldLabel})`);
          // The field will be missing from formData which will cause the worker to skip it
        }
      }
      
      // Cover letter fields
      else if (fieldType === 'textarea' && 
              (fieldNameLower.includes('cover') || 
               fieldNameLower.includes('motivation') || 
               fieldLabelLower.includes('cover letter') || 
               fieldLabelLower.includes('motivation'))) {
        formData[fieldName] = await generateCoverLetter(user, profile, job, matchScore);
      }
      
      // Handle radio buttons and checkbox fields with options
      else if ((fieldType === 'radio' || fieldType === 'checkbox' || fieldType === 'fieldset') && 
               field.options && field.options.length > 0) {
        
        // For yes/no questions, we'll typically answer positively
        const isYesNoQuestion = field.options.some((opt: any) => 
          (opt.label || '').toLowerCase().includes('yes') || 
          (opt.label || '').toLowerCase().includes('no'));
          
        if (isYesNoQuestion) {
          // Find the "yes" option
          const yesOption = field.options.find((opt: any) => 
            (opt.label || '').toLowerCase().includes('yes'));
            
          if (yesOption) {
            formData[fieldName] = yesOption.value;
          } else {
            // If no yes option found, use the first option's value
            formData[fieldName] = field.options[0].value;
          }
        }
        // For questions about authorization, legal right to work, etc.
        else if (fieldLabelLower.includes('authorized') || 
                fieldLabelLower.includes('authorization') || 
                fieldLabelLower.includes('legally') || 
                fieldLabelLower.includes('right to work')) {
          // Find a positive/yes option
          const positiveOption = field.options.find((opt: any) => 
            ['yes', 'true', 'authorized', 'authorization'].some(term => 
              (opt.label || '').toLowerCase().includes(term)));
              
          if (positiveOption) {
            formData[fieldName] = positiveOption.value;
          } else {
            // Default to first option if no positive one is found
            formData[fieldName] = field.options[0].value;
          }
        }
        // For other questions, use AI to select the best option
        else {
          try {
            // Use AI to select the best option for this question
            console.log(`Using AI to select the best option for field: ${fieldName} (${fieldLabel})`);
            
            // Extract resume text if available
            const resumeText = user.resumeText || '';
            
            // Use our AI option selector
            const bestOptionIndex = await selectBestOptionWithAI(
              fieldLabel,
              field.options,
              resumeText,
              profile || {},
              job.description
            );
            
            // Use the AI-selected option
            formData[fieldName] = field.options[bestOptionIndex].value;
            console.log(`AI selected option ${bestOptionIndex + 1} for ${fieldLabel}`);
          } catch (error) {
            console.error(`Error selecting option with AI for ${fieldName}:`, error);
            
            // Fallback to first option if AI fails
            console.log(`Falling back to first option for field: ${fieldName} (${fieldLabel})`);
            formData[fieldName] = field.options[0].value;
          }
        }
      }
      
      // For generic text and textarea fields - use our answer generation
      else if ((fieldType === 'textarea' || fieldType === 'text') && field.required) {
        formData[fieldName] = await generateCustomAnswers(fieldLabel, user, profile, job);
      }
      
      // For select/dropdown fields
      else if (fieldType === 'select' && field.required) {
        // If options are provided
        if (field.options && field.options.length > 0) {
          try {
            // Use AI to select the best option for this dropdown
            console.log(`Using AI to select the best option for dropdown: ${fieldName} (${fieldLabel})`);
            
            // Extract resume text if available
            const resumeText = user.resumeText || '';
            
            // Use our AI option selector
            const bestOptionIndex = await selectBestOptionWithAI(
              fieldLabel,
              field.options,
              resumeText,
              profile || {},
              job.description
            );
            
            // Use the AI-selected option
            formData[fieldName] = field.options[bestOptionIndex].value;
            console.log(`AI selected dropdown option ${bestOptionIndex + 1} for ${fieldLabel}`);
          } catch (error) {
            console.error(`Error selecting dropdown option with AI for ${fieldName}:`, error);
            // Fallback to first option
            formData[fieldName] = field.options[0].value;
          }
        } else {
          // Otherwise put a placeholder
          formData[fieldName] = '';
        }
      }
    }
    
    // Check if we need to add resume data for the Playwright worker
    if (resume && resume.fileData) {
      // CRITICAL: Worker requires both:
      // 1. The resumeFilePath field (but not with base64:// prefix)
      // 2. The raw resume data in the resume field
      
      // Add the resume content directly in the 'resume' field
      formData.resume = resume.fileData;
      
      // The worker requires resumeFilePath but can't handle the base64:// prefix
      // We'll use a special placeholder that the worker code understands
      formData.resumeFilePath = "__BASE64_ENCODED__";
      
      // Set the content type and filename
      // Default to PDF if content type is not available
      formData.resumeContentType = 'application/pdf';
      formData.resumeFilename = resume.filename || 'resume.pdf';
      
      // Add a flag to indicate we're sending a Base64-encoded file
      formData.isResumeBase64 = true;
    }
    
    // Prepare the payload to submit to the Playwright worker's /submit endpoint
    const payload = {
      job: {
        applyUrl: job.applyUrl
      },
      formData
    };
    
    // Make the API request to the Playwright worker's /submit endpoint
    console.log(`Sending form data to ${completeWorkerUrl}/submit with ${Object.keys(formData).length} fields mapped`);
    
    // Log form data for debugging (excluding resume data which is too large)
    const formDataForLogging = JSON.parse(JSON.stringify(formData)); // Deep clone to avoid reference issues
    
    // Clean up any resume data from logs
    if (formDataForLogging.resume) {
      formDataForLogging.resume = "[RESUME DATA TRUNCATED]";
    }
    
    // Also clean up the resumeFilePath if it contains Base64 data
    if (formDataForLogging.resumeFilePath && typeof formDataForLogging.resumeFilePath === 'string' && 
        formDataForLogging.resumeFilePath.startsWith('base64://')) {
      formDataForLogging.resumeFilePath = "[BASE64 RESUME DATA TRUNCATED]";
    }
    
    // Clean any other fields that might contain the resume data
    Object.keys(formDataForLogging).forEach(key => {
      if (typeof formDataForLogging[key] === 'string') {
        // Check for Base64 encoded PDFs (JVBERi0 is PDF header in Base64)
        if (formDataForLogging[key].length > 1000 && formDataForLogging[key].includes('JVBERi0')) {
          formDataForLogging[key] = `[LARGE BASE64 PDF DATA (${formDataForLogging[key].length} chars) TRUNCATED]`;
        }
        // Check for any very large string that might be a file
        else if (formDataForLogging[key].length > 1000) {
          formDataForLogging[key] = `[LARGE STRING DATA (${formDataForLogging[key].length} chars) TRUNCATED]`;
        }
      } else if (formDataForLogging[key] && typeof formDataForLogging[key] === 'object') {
        // Check nested objects too
        Object.keys(formDataForLogging[key]).forEach(nestedKey => {
          if (typeof formDataForLogging[key][nestedKey] === 'string' && 
              formDataForLogging[key][nestedKey].length > 1000) {
            formDataForLogging[key][nestedKey] = `[LARGE NESTED DATA (${formDataForLogging[key][nestedKey].length} chars) TRUNCATED]`;
          }
        });
      }
    });
    
    // Log only a reasonable amount of the form data
    console.log(`Form data for ${job.jobTitle} at ${job.company} (truncated):`);
    const formDataString = JSON.stringify(formDataForLogging, null, 2);
    console.log(formDataString.length > 2000 ? formDataString.substring(0, 2000) + '... [truncated]' : formDataString);
    
    const response = await fetch(`${completeWorkerUrl}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload)
    });
    
    // Handle the response
    if (!response.ok) {
      console.error(`Submission request failed with status: ${response.status}`);
      
      try {
        const errorData = await response.json();
        console.error("Error details:", errorData);
        
        // Special handling for specific error cases
        if (errorData.status === "skipped") {
          return "skipped";
        }
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
      }
      
      return "error";
    }
    
    // Parse and process successful response
    const result = await response.json();
    
    if (result.status === "success") {
      console.log(`Application successfully submitted for ${job.jobTitle} at ${job.company}`);
      return "success";
    } else if (result.status === "skipped") {
      console.log(`Application skipped: ${result.message || "No reason provided"}`);
      return "skipped";
    } else {
      console.error(`Unexpected result status: ${result.status}`);
      return "error";
    }
  } catch (error) {
    console.error("Error in Workable schema-driven application process:", error);
    return "error";
  }
}

/**
 * Generate a cover letter based on the user profile and job details
 * Enhanced with AI-generated content when available
 */
async function generateCoverLetter(user: User, profile: UserProfile | undefined, job: JobListing, matchScore: number): Promise<string> {
  try {
    // Extract resume text from user record if available
    const resumeText = user.resumeText || '';
    
    // Try to generate an AI cover letter
    const aiCoverLetter = await generateAICoverLetter(resumeText, profile || {}, job.description);
    if (aiCoverLetter) {
      return aiCoverLetter;
    }
  } catch (error) {
    console.error("Error generating AI cover letter:", error);
    // Fall back to template-based cover letter
  }
  
  // Fallback to template-based cover letter if AI generation fails
  const userName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const userTitle = profile?.jobTitle || "qualified professional";
  const userSkills = profile?.skills || [];
  
  return `Dear ${job.company} Hiring Team,

I'm ${userName}, a ${userTitle} with a strong interest in the ${job.jobTitle} position. My background and skills align well with the requirements for this role.

${userSkills.length > 0 ? `My core skills include ${userSkills.slice(0, 3).join(', ')}, which I believe are relevant to this opportunity.` : ''}

I'm particularly interested in joining ${job.company} because of the impact I could make in this role, and I'm excited about the opportunity to contribute to your team.

I look forward to discussing how my background and skills would be a good fit for this position.

Sincerely,
${userName}`;
}

/**
 * Generate answers to custom application questions
 * Enhanced with AI-generated answers when available
 */
async function generateCustomAnswers(questionLabel: string, user: User, profile: UserProfile | undefined, job: JobListing): Promise<string> {
  try {
    // Extract resume text from user record if available
    const resumeText = user.resumeText || '';
    
    // Try to generate an AI answer for this specific question
    const aiAnswer = await generateApplicationAnswer(
      questionLabel,
      '', // field name not known here
      resumeText,
      profile || {},
      job.description
    );
    
    if (aiAnswer) {
      return aiAnswer;
    }
  } catch (error) {
    console.error("Error generating AI answer:", error);
    // Fall back to template-based answers
  }
  // No question label provided
  if (!questionLabel || typeof questionLabel !== 'string') {
    return `I'm excited about this opportunity and believe my skills would be a good match for ${job.company}.`;
  }

  // Convert to lowercase for matching
  const questionLower = questionLabel.toLowerCase();
  const userName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim();
  const userTitle = profile?.jobTitle || "qualified professional";
  const userSkills = profile?.skills || [];
  const skillsText = userSkills.length > 0 
    ? userSkills.slice(0, 3).join(', ') 
    : "problem-solving, communication, and technical expertise";
  
  // Education info
  const education = profile?.education && profile.education.length > 0 
    ? profile.education[0] 
    : null;
  const educationText = education 
    ? `${education.degree} from ${education.institution}` 
    : "relevant educational background";
  
  // Work experience info
  const workExperience = profile?.workExperience && profile.workExperience.length > 0 
    ? profile.workExperience[0] 
    : null;
  const experienceText = workExperience 
    ? `experience as a ${workExperience.role} at ${workExperience.company}` 
    : "professional experience in relevant roles";
  
  // Experience-related questions
  if (questionLower.includes('experience') || 
      questionLower.includes('worked') ||
      questionLower.includes('background') ||
      questionLower.includes('history')) {
    return `I have ${experienceText} that aligns with the ${job.jobTitle} position. My background has prepared me to contribute effectively to ${job.company} by leveraging my skills in ${skillsText}.`;
  }
  
  // Skills and strengths
  if (questionLower.includes('strength') || 
      questionLower.includes('skills') || 
      questionLower.includes('abilities') ||
      questionLower.includes('competencies') ||
      questionLower.includes('qualities')) {
    return `My key strengths include ${skillsText}. I've developed these skills throughout my career and am confident they would allow me to excel in this position at ${job.company}.`;
  }
  
  // Motivation questions
  if ((questionLower.includes('why') && 
      (questionLower.includes('apply') || 
       questionLower.includes('interest') || 
       questionLower.includes('join') || 
       questionLower.includes('position') || 
       questionLower.includes('role'))) ||
      questionLower.includes('motivation') ||
      questionLower.includes('attracted')) {
    return `I'm interested in this ${job.jobTitle} position at ${job.company} because it aligns with my professional goals and the company's mission. I believe my skills in ${skillsText} would make me a valuable addition to your team, and I'm excited about the opportunity to contribute to your projects.`;
  }
  
  // Salary expectations
  if (questionLower.includes('salary') || 
      questionLower.includes('compensation') || 
      questionLower.includes('expect') || 
      questionLower.includes('pay')) {
    return `My salary expectations are flexible and based on the total compensation package, including benefits. I'm looking for a fair package that reflects the responsibilities of the role and my experience level, and I'm open to discussing this further during the interview process.`;
  }
  
  // Notice period
  if (questionLower.includes('notice period') || 
      questionLower.includes('when') && questionLower.includes('start') ||
      questionLower.includes('available')) {
    return `I could be available to start within 2-4 weeks of receiving an offer, though I'm flexible and can adjust based on the needs of ${job.company}.`;
  }
  
  // Relocation
  if (questionLower.includes('relocate') || 
      questionLower.includes('relocation') || 
      questionLower.includes('move')) {
    return `I'm open to relocation opportunities for the right position, and this role at ${job.company} certainly fits that criterion.`;
  }
  
  // Remote work
  if (questionLower.includes('remote') || 
      questionLower.includes('work from home') || 
      questionLower.includes('hybrid')) {
    return `I'm comfortable and experienced with remote work environments, having the discipline and communication skills needed to be effective in a distributed team. I'm also open to hybrid arrangements based on ${job.company}'s preferences.`;
  }
  
  // Education
  if (questionLower.includes('education') || 
      questionLower.includes('degree') || 
      questionLower.includes('academic')) {
    return `I have ${educationText}, which has provided me with a strong foundation in my field. This education has equipped me with both theoretical knowledge and practical skills that I believe would be valuable for this role at ${job.company}.`;
  }
  
  // Languages
  if (questionLower.includes('language') || 
      questionLower.includes('speak') || 
      questionLower.includes('fluent')) {
    return `I'm fluent in English, with strong written and verbal communication skills that would enable me to communicate effectively with team members and stakeholders at ${job.company}.`;
  }

  // Team work
  if (questionLower.includes('team') || 
      questionLower.includes('collaborate') || 
      questionLower.includes('group')) {
    return `I thrive in collaborative environments and enjoy working as part of a team. Throughout my career, I've found that diverse perspectives lead to more innovative solutions, and I look forward to contributing to the team dynamics at ${job.company}.`;
  }
  
  // Default response for other questions
  return `I appreciate this question and would be happy to discuss it in more detail during an interview. Based on my understanding of the ${job.jobTitle} role at ${job.company}, I believe my background and approach would align well with what you're looking for.`;
}