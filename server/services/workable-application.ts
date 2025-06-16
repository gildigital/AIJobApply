/**
 * Workable Application Submission Service
 *
 * This file implements the schema-driven approach for submitting applications
 * to Workable job postings through the following two-phase workflow:
 *
 * 1. Phase 1: Introspect the form to understand what fields are required
 * 2. Phase 2: Prepare the data and submit the application
 */

import { workableScraper } from "./workable-scraper.js";
import type { JobListing } from "./auto-apply-service.js";
import {
  generateApplicationAnswer,
  generateCoverLetter as generateAICoverLetter,
  selectBestOptionWithAI,
} from "../utils/application-ai-service.js";
import { queueJobApplication, type JobApplicationPayload } from "./job-application-queue.js";

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
import type {
  User as BaseUser,
  UserProfile as BaseUserProfile,
  Resume,
} from "@shared/schema.js";

// Extended interfaces to handle possible missing properties in schema
interface User extends BaseUser {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  name?: string;
  resumeText?: string;
}

// Extended Resume interface to include content type
interface ResumeWithContentType extends Resume {
  contentType?: string;
  fileData?: string;
  filename?: string;
}

// Extended UserProfile to handle additional properties
interface UserProfile extends BaseUserProfile {
  fullName?: string;
  phoneNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  linkedinProfile?: string;
  personalWebsite?: string;
  githubProfile?: string;
  portfolioLink?: string;
  email?: string;
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
 * Submit a job application to Workable using the async queue pattern
 * 
 * This function has been redesigned to eliminate the catastrophic timeout errors
 * by queuing the job for asynchronous processing instead of waiting synchronously.
 *
 * @param user The user submitting the application
 * @param resume The user's resume (if available)
 * @param profile The user's profile (if available)
 * @param job The Workable job to apply to
 * @param matchScore The calculated match score
 * @returns Result of the application queueing attempt
 */
export async function submitWorkableApplication(
  user: User,
  resume: ResumeWithContentType | undefined,
  profile: UserProfile | undefined,
  job: JobListing,
  matchScore: number,
): Promise<"success" | "skipped" | "error"> {
  console.log(`⏳ Starting async application submission process for ${job.jobTitle} at ${job.company}...`);
  
  try {
    // Check if we have a worker URL configured
    const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
    if (!workerUrl) {
      console.error("No Playwright worker URL configured");
      return "error";
    }

    // Phase 1: Introspection - Get the schema of the form (still synchronous for now)
    console.log(`Phase 1: Introspecting form structure for: ${job.applyUrl}`);
    const rawFormSchema = await workableScraper.introspectJobForm(job.applyUrl);

    // Handle various response formats from the worker
    let fields = null;
    if (rawFormSchema && typeof rawFormSchema === 'object') {
      // Case 1: New nested format { status: "success", formSchema: { status: "success", fields: [...] } }
      if (rawFormSchema.formSchema?.fields && Array.isArray(rawFormSchema.formSchema.fields)) {
        fields = rawFormSchema.formSchema.fields;
      }
      // Case 2: Direct formSchema with fields { status: "success", fields: [...] }
      else if (rawFormSchema.fields && Array.isArray(rawFormSchema.fields)) {
        fields = rawFormSchema.fields;
      }
      // Case 3: Legacy direct fields array [...]
      else if (Array.isArray(rawFormSchema)) {
        fields = rawFormSchema;
      }
      else {
        console.error("Unexpected form schema structure:", JSON.stringify(rawFormSchema, null, 2));
        return "error";
      }
    } else if (Array.isArray(rawFormSchema)) {
      fields = rawFormSchema;
    } else {
      console.error("Unexpected form schema structure:", JSON.stringify(rawFormSchema, null, 2));
      return "error";
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      console.error("No form fields found during introspection");
      return "error";
    }

    console.log(`✅ Form introspection completed. Found ${fields.length} fields`);

    // Phase 2: Data Processing - Prepare the data for the form
    console.log(`Phase 2: Processing application data...`);

    // Prepare user data
    const userData = {
      id: user.id,
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      firstName: user.firstName || (user.name ? user.name.split(' ')[0] : ''),
      lastName: user.lastName || (user.name ? user.name.split(' ').slice(1).join(' ') : ''),
      resumeText: user.resumeText || ''
    };

    // Process resume data
    let resumeData = null;
    if (resume) {
      resumeData = {
        id: resume.id,
        filename: resume.filename || 'resume.pdf',
        contentType: resume.contentType || 'application/pdf',
        fileContent: resume.fileData || resume.fileContent || ''
      };
    }

    // Generate form field mappings using AI
    const formData = await processFormWithAI(fields, userData, profile, job, matchScore);
    
    if (!formData) {
      console.error("Failed to process form data with AI");
      return "error";
    }

    console.log(`✅ Application data processing completed`);

    // Phase 3: Queue for Async Processing
    console.log(`Phase 3: Queueing application for async processing...`);

    const queuePayload: JobApplicationPayload = {
      user: userData,
      resume: resumeData,
      profile,
      job,
      matchScore,
      formData
    };

    const queueResult = await queueJobApplication(queuePayload);

    if (queueResult.success) {
      console.log(`✅ Application queued successfully: ${queueResult.message}`);
      console.log(`📋 Queue ID: ${queueResult.queuedJobId} - Application will be processed asynchronously`);
      
      // Return success immediately - the job is now queued for processing
      // The actual browser automation will happen in the background
      return "success";
    } else {
      console.error(`Failed to queue application: ${queueResult.message}`);
      return "error";
    }

  } catch (error) {
    console.error("Error in Workable async application process:", error);
    return "error";
  }
}

/**
 * Process form fields with AI to generate appropriate responses
 * 
 * This function takes the introspected form fields and generates appropriate
 * values for each field using AI services.
 */
async function processFormWithAI(
  fields: any[],
  userData: any,
  profile: UserProfile | undefined,
  job: JobListing,
  matchScore: number
): Promise<any> {
  try {
    const formData: Record<string, any> = {};
    const userPlan = userData.subscriptionPlan || 'FREE';

    for (const field of fields) {
      const fieldName = field.name || field.id;
      if (!fieldName) continue;

      // Handle different field types
      switch (field.type) {
        case 'text':
        case 'email':
        case 'tel':
          formData[fieldName] = await handleTextFieldWithAI(field, userData, profile, job, userPlan);
          break;
          
        case 'select':
        case 'radio':
          formData[fieldName] = await handleSelectFieldWithAI(field, userData, profile, job, userPlan);
          break;
          
        case 'textarea':
          formData[fieldName] = await handleTextareaFieldWithAI(field, userData, profile, job, userPlan);
          break;
          
        case 'file':
          // Handle file uploads (resume)
          if (field.name === 'resume' || field.name === 'cv' || field.name.includes('resume')) {
            formData[fieldName] = 'resume_upload'; // Placeholder for resume upload
          }
          break;
          
        case 'checkbox':
          formData[fieldName] = handleCheckboxField(field);
          break;
          
        default:
          // Try to infer the field type from the label or name
          formData[fieldName] = await handleGenericFieldWithAI(field, userData, profile, job, userPlan);
      }
    }

    return formData;
  } catch (error) {
    console.error('Error processing form with AI:', error);
    return null;
  }
}

/**
 * Handle text input fields with AI
 */
async function handleTextFieldWithAI(
  field: any,
  userData: any,
  profile: UserProfile | undefined,
  job: JobListing,
  userPlan: string
): Promise<string> {
  const fieldName = field.name || field.id;
  const label = field.label || field.placeholder || '';

  // Direct mappings for common fields
  if (fieldName === 'first_name' || fieldName === 'firstName' || label.toLowerCase().includes('first name')) {
    return userData.firstName || '';
  }
  if (fieldName === 'last_name' || fieldName === 'lastName' || label.toLowerCase().includes('last name')) {
    return userData.lastName || '';
  }
  if (fieldName === 'email' || field.type === 'email') {
    return userData.email || '';
  }
  if (fieldName === 'phone' || field.type === 'tel' || label.toLowerCase().includes('phone')) {
    return userData.phone || '';
  }

  // For other text fields, use AI to generate appropriate responses
  if (label) {
    try {
      return await generateApplicationAnswer(
        label,
        fieldName,
        userData.resumeText || '',
        profile || {},
        job.description,
        undefined,
        userPlan
      );
    } catch (error) {
      console.error(`Error generating AI answer for field ${fieldName}:`, error);
      return '';
    }
  }

  return '';
}

/**
 * Handle select/dropdown fields with AI
 */
async function handleSelectFieldWithAI(
  field: any,
  userData: any,
  profile: UserProfile | undefined,
  job: JobListing,
  userPlan: string
): Promise<string> {
  const fieldName = field.name || field.id;
  const label = field.label || '';
  const options = field.options || [];

  if (options.length === 0) {
    return '';
  }

  // If only one option, select it
  if (options.length === 1) {
    return options[0].value || options[0];
  }

  try {
    const selectedIndex = await selectBestOptionWithAI(
      label,
      options,
      userData.resumeText || '',
      profile || {},
      job.description,
      fieldName,
      undefined,
      userPlan
    );
    
    const selectedOption = options[selectedIndex];
    return selectedOption?.value || selectedOption || '';
  } catch (error) {
    console.error(`Error selecting AI option for field ${fieldName}:`, error);
    return options[0]?.value || options[0] || '';
  }
}

/**
 * Handle textarea fields with AI
 */
async function handleTextareaFieldWithAI(
  field: any,
  userData: any,
  profile: UserProfile | undefined,
  job: JobListing,
  userPlan: string
): Promise<string> {
  const fieldName = field.name || field.id;
  const label = field.label || field.placeholder || '';

  // Check if this is a cover letter field
  if (label.toLowerCase().includes('cover letter') || fieldName.toLowerCase().includes('cover')) {
    try {
      return await generateCoverLetter(userData, profile, job, 0);
    } catch (error) {
      console.error('Error generating cover letter:', error);
      return '';
    }
  }

  // For other textarea fields, use AI to generate longer responses
  if (label) {
    try {
      return await generateApplicationAnswer(
        label,
        fieldName,
        userData.resumeText || '',
        profile || {},
        job.description,
        undefined,
        userPlan
      );
    } catch (error) {
      console.error(`Error generating AI answer for textarea ${fieldName}:`, error);
      return '';
    }
  }

  return '';
}

/**
 * Handle checkbox fields
 */
function handleCheckboxField(field: any): boolean {
  const fieldName = field.name || field.id;
  const label = field.label || '';

  // Common patterns for checkboxes that should be checked
  const positivePatterns = [
    'agree', 'consent', 'accept', 'terms', 'privacy', 'gdpr',
    'subscribe', 'newsletter', 'updates', 'contact'
  ];

  const labelLower = label.toLowerCase();
  const fieldNameLower = fieldName.toLowerCase();

  return positivePatterns.some(pattern => 
    labelLower.includes(pattern) || fieldNameLower.includes(pattern)
  );
}

/**
 * Handle generic fields with AI
 */
async function handleGenericFieldWithAI(
  field: any,
  userData: any,
  profile: UserProfile | undefined,
  job: JobListing,
  userPlan: string
): Promise<any> {
  const fieldName = field.name || field.id;
  const label = field.label || field.placeholder || '';

  if (label) {
    try {
      return await generateApplicationAnswer(
        label,
        fieldName,
        userData.resumeText || '',
        profile || {},
        job.description,
        undefined,
        userPlan
      );
    } catch (error) {
      console.error(`Error generating AI answer for generic field ${fieldName}:`, error);
      return '';
    }
  }

  return '';
}

/**
 * Generate a cover letter based on the user profile and job details
 */
async function generateCoverLetter(
  user: User,
  profile: UserProfile | undefined,
  job: JobListing,
  matchScore: number,
): Promise<string> {
  try {
    const resumeText = user.resumeText || "";
    const aiCoverLetter = await generateAICoverLetter(
      resumeText,
      profile || {},
      job.description,
      job.company,
      job.jobTitle,
      user.subscriptionPlan || "FREE"
    );
    if (aiCoverLetter) {
      return aiCoverLetter;
    }
  } catch (error) {
    console.error("Error generating AI cover letter:", error);
  }

  const userName =
    user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim();
  const userTitle = profile?.jobTitle || "qualified professional";
  const userSkills = profile?.skills || [];

  return `Dear ${job.company} Hiring Team,

I'm ${userName}, a ${userTitle} with a strong interest in the ${job.jobTitle} position. My background and skills align well with the requirements for this role.

${userSkills.length > 0 ? `My core skills include ${userSkills.slice(0, 3).join(", ")}, which I believe are relevant to this opportunity.` : ""}

I'm particularly interested in joining ${job.company} because of the impact I could make in this role, and I'm excited about the opportunity to contribute to your team.

I look forward to discussing how my background and skills would be a good fit for this position.

Sincerely,
${userName}`;
}

/**
 * Generate answers to custom application questions
 */
async function generateCustomAnswers(
  questionLabel: string,
  user: User,
  profile: UserProfile | undefined,
  job: JobListing,
): Promise<string> {
  try {
    const resumeText = user.resumeText || "";
    const aiAnswer = await generateApplicationAnswer(
      questionLabel,
      "", // field name not known here
      resumeText,
      profile || {},
      job.description,
      undefined, // qa context not available here
      user.subscriptionPlan || "FREE"
    );
    if (aiAnswer) {
      return aiAnswer;
    }
  } catch (error) {
    console.error("Error generating AI answer:", error);
  }

  if (!questionLabel || typeof questionLabel !== "string") {
    return `I'm excited about this opportunity and believe my skills would be a good match for ${job.company}.`;
  }

  const questionLower = questionLabel.toLowerCase();
  const userName =
    user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim();
  const userTitle = profile?.jobTitle || "qualified professional";
  const userSkills = profile?.skills || [];
  const skillsText =
    userSkills.length > 0
      ? userSkills.slice(0, 3).join(", ")
      : "problem-solving, communication, and technical expertise";

  const education =
    profile?.education && profile.education.length > 0
      ? profile.education[0]
      : null;
  const educationText = education
    ? `${education.degree} from ${education.institution}`
    : "relevant educational background";

  const workExperience =
    profile?.workExperience && profile.workExperience.length > 0
      ? profile.workExperience[0]
      : null;
  const experienceText = workExperience
    ? `experience as a ${workExperience.role} at ${workExperience.company}`
    : "professional experience in relevant roles";

  if (
    questionLower.includes("experience") ||
    questionLower.includes("worked") ||
    questionLower.includes("background") ||
    questionLower.includes("history")
  ) {
    return `I have ${experienceText} that aligns with the ${job.jobTitle} position. My background has prepared me to contribute effectively to ${job.company} by leveraging my skills in ${skillsText}.`;
  }

  if (
    questionLower.includes("strength") ||
    questionLower.includes("skills") ||
    questionLower.includes("abilities") ||
    questionLower.includes("competencies") ||
    questionLower.includes("qualities")
  ) {
    return `My key strengths include ${skillsText}. I've developed these skills throughout my career and am confident they would allow me to excel in this position at ${job.company}.`;
  }

  if (
    (questionLower.includes("why") &&
      (questionLower.includes("apply") ||
        questionLower.includes("interest") ||
        questionLower.includes("join") ||
        questionLower.includes("position") ||
        questionLower.includes("role"))) ||
    questionLower.includes("motivation") ||
    questionLower.includes("attracted")
  ) {
    return `I'm interested in this ${job.jobTitle} position at ${job.company} because it aligns with my professional goals and the company's mission. I believe my skills in ${skillsText} would make me a valuable addition to your team, and I'm excited about the opportunity to contribute to your projects.`;
  }

  if (
    questionLower.includes("salary") ||
    questionLower.includes("compensation") ||
    questionLower.includes("expect") ||
    questionLower.includes("pay")
  ) {
    return `My salary expectations are flexible and based on the total compensation package, including benefits. I'm looking for a fair package that reflects the responsibilities of the role and my experience level, and I'm open to discussing this further during the interview process.`;
  }

  if (
    questionLower.includes("notice period") ||
    (questionLower.includes("when") && questionLower.includes("start")) ||
    questionLower.includes("available")
  ) {
    return `I could be available to start within 2-4 weeks of receiving an offer, though I'm flexible and can adjust based on the needs of ${job.company}.`;
  }

  if (
    questionLower.includes("relocate") ||
    questionLower.includes("relocation") ||
    questionLower.includes("move")
  ) {
    return `I'm open to relocation opportunities for the right position, and this role at ${job.company} certainly fits that criterion.`;
  }

  if (
    questionLower.includes("remote") ||
    questionLower.includes("work from home") ||
    questionLower.includes("hybrid")
  ) {
    return `I'm comfortable and experienced with remote work environments, having the discipline and communication skills needed to be effective in a distributed team. I'm also open to hybrid arrangements based on ${job.company}'s preferences.`;
  }

  if (
    questionLower.includes("education") ||
    questionLower.includes("degree") ||
    questionLower.includes("academic")
  ) {
    return `I have ${educationText}, which has provided me with a strong foundation in my field. This education has equipped me with both theoretical knowledge and practical skills that I believe would be valuable for this role at ${job.company}.`;
  }

  if (
    questionLower.includes("language") ||
    questionLower.includes("speak") ||
    questionLower.includes("fluent")
  ) {
    return `I'm fluent in English, with strong written and verbal communication skills that would enable me to communicate effectively with team members and stakeholders at ${job.company}.`;
  }

  if (
    questionLower.includes("team") ||
    questionLower.includes("collaborate") ||
    questionLower.includes("group")
  ) {
    return `I thrive in collaborative environments and enjoy working as part of a team. Throughout my career, I've found that diverse perspectives lead to more innovative solutions, and I look forward to contributing to the team dynamics at ${job.company}.`;
  }

  return `I appreciate this question and would be happy to discuss it in more detail during an interview. Based on my understanding of the ${job.jobTitle} role at ${job.company}, I believe my background and approach would align well with what you're looking for.`;
}
