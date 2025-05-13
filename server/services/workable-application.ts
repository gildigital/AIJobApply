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
} from "@shared/schema";

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
  matchScore: number,
): Promise<"success" | "skipped" | "error"> {
  console.log(`⏳ Starting application submission process for ${job.jobTitle} at ${job.company}...`);
  try {
    console.log(
      `Processing Workable application using schema-driven approach for ${job.jobTitle} at ${job.company}`,
    );

    // Check if we have a worker URL configured
    const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
    if (!workerUrl) {
      console.error("No Playwright worker URL configured");
      return "error";
    }

    // Make sure the URL includes the protocol
    const completeWorkerUrl = workerUrl.startsWith("http")
      ? workerUrl
      : `https://${workerUrl}`;

    // Phase 1: Introspection - Get the schema of the form
    console.log(`Phase 1: Introspecting form structure for: ${job.applyUrl}`);
    const rawFormSchema = await workableScraper.introspectJobForm(job.applyUrl);

    // Handle the new nested structure
    let fields = null;

    // Case 1: New structure with nested formSchema
    if (
      rawFormSchema?.formSchema?.fields &&
      Array.isArray(rawFormSchema.formSchema.fields)
    ) {
      fields = rawFormSchema.formSchema.fields;
      console.log(
        `Using new nested formSchema structure with ${fields.length} fields`,
      );
    }
    // Case 2: Legacy structure with direct fields array
    else if (rawFormSchema?.fields && Array.isArray(rawFormSchema.fields)) {
      fields = rawFormSchema.fields;
      console.log(
        `Using legacy formSchema structure with ${fields.length} fields`,
      );
    }

    // Validate we have fields
    if (!fields || fields.length === 0) {
      console.error("Form introspection failed or returned no fields");
      return "skipped";
    }

    // Create a standardized formSchema for the rest of the function
    const formSchema = {
      fields: fields,
      status: "success",
    };

    console.log(
      `Introspection successful: Found ${formSchema.fields.length} form fields`,
    );

    // Phase 2: Prepare data and submit application
    console.log(`Phase 2: Preparing form data for submission`);

    // Prepare the formData object based on the introspected schema
    const formData: Record<string, any> = {};

    // First, analyze what fields are required
    const requiredFields = formSchema.fields.filter(
      (field: any) => field.required,
    );
    console.log(
      `Found ${requiredFields.length} required fields out of ${formSchema.fields.length} total fields`,
    );

    // Helper to check if we'll be able to satisfy the required fields
    const canSatisfyRequiredFields = requiredFields.every((field: any) => {
      const fieldNameLower = (field.name || field.id || "").toLowerCase();
      const fieldLabelLower = (field.label || "").toLowerCase();

      // For checkboxes, we can set to true
      if (field.type === "checkbox" && field.required) {
        return true;
      }

      // For file type fields, we need a resume
      if (field.type === "file") {
        const isResumeField =
          fieldNameLower.includes("resume") ||
          fieldNameLower.includes("cv") ||
          fieldLabelLower.includes("resume") ||
          fieldLabelLower.includes("cv");
        if (isResumeField) {
          if (!resume || !resume.fileData) {
            console.log(
              `Missing required resume file for field: ${field.name} (${field.label || "no label"})`,
            );
            return false;
          }
          return true;
        }
        console.log(
          `Unknown file field type required: ${field.name} (${field.label || "no label"}) - will try to proceed anyway`,
        );
        return true;
      }

      // For basic fields like name/email
      if (field.required) {
        if (
          (fieldNameLower.includes("email") ||
            fieldLabelLower.includes("email")) &&
          !user.email
        ) {
          console.log(`Missing required email field: ${field.name}`);
          return false;
        }
        if (
          (fieldNameLower.includes("name") ||
            fieldLabelLower.includes("name")) &&
          !user.name &&
          !user.firstName &&
          !user.lastName &&
          !(profile && profile.fullName)
        ) {
          console.log(`Missing required name field: ${field.name}`);
          return false;
        }
        // For other text/textarea/radio/select fields, we can use LLM
        if (["text", "textarea", "radio", "select"].includes(field.type)) {
          return true;
        }
      }

      return true;
    });

    if (!canSatisfyRequiredFields) {
      console.log("Cannot satisfy all required fields, skipping application");
      return "skipped";
    }

    // Define basic fields that can be mapped directly from user/profile
    const basicFieldMappings: Record<
      string,
      {
        keys: string[];
        value: (user: User, profile: UserProfile | undefined) => string;
      }
    > = {
      firstname: {
        keys: ["first_name", "firstname", "first name"],
        value: (user, profile) =>
          user.firstName ||
          (profile?.fullName ? profile.fullName.split(" ")[0] : ""),
      },
      lastname: {
        keys: ["last_name", "lastname", "last name"],
        value: (user, profile) =>
          user.lastName ||
          (profile?.fullName
            ? profile.fullName.split(" ").slice(1).join(" ")
            : ""),
      },
      fullname: {
        keys: ["full_name", "fullname", "full name"],
        value: (user, profile) => profile?.fullName || user.name || "",
      },
      email: {
        keys: ["email"],
        value: (user, profile) => profile?.email || user.email || "",
      },
      phone: {
        keys: ["phone", "mobile"],
        value: (user, profile) => profile?.phoneNumber || user.phone || "",
      },
      address: {
        keys: ["address"],
        value: (user, profile) => profile?.address || "",
      },
      city: {
        keys: ["city"],
        value: (user, profile) => profile?.city || "",
      },
      state: {
        keys: ["state"],
        value: (user, profile) => profile?.state || "",
      },
      zip: {
        keys: ["zip", "postal"],
        value: (user, profile) => profile?.zipCode || "",
      },
      linkedin: {
        keys: ["linkedin"],
        value: (user, profile) => profile?.linkedinProfile || "",
      },
      website: {
        keys: ["website", "personal website"],
        value: (user, profile) => profile?.personalWebsite || "",
      },
      github: {
        keys: ["github"],
        value: (user, profile) => profile?.githubProfile || "",
      },
      portfolio: {
        keys: ["portfolio"],
        value: (user, profile) => profile?.portfolioLink || "",
      },
    };

    // Now map all introspected fields to formData
    for (const field of formSchema.fields) {
      const fieldName =
        field.name ||
        field.id ||
        `field_${Math.random().toString(36).substring(2, 10)}`;
      const fieldType = field.type || "text";
      const fieldLabel = field.label || "";
      const fieldNameLower = (
        typeof fieldName === "string" ? fieldName : ""
      ).toLowerCase();
      const fieldLabelLower = fieldLabel.toLowerCase();
      
      // Store the selector in formData for the Playwright worker to use
      // This is crucial for reliable field location during submission phase
      if (field.selector) {
        formData[`${fieldName}_selector`] = field.selector;
        console.log(`Storing selector for field "${fieldName}": ${field.selector}`);
      }

      console.log(
        `Processing field: ${fieldName} (type: ${fieldType}, label: ${fieldLabel}, required: ${field.required})`,
      );

      // Handle required checkboxes (e.g., GDPR)
      if (fieldType === "checkbox" && field.required) {
        formData[fieldName] = true;
        console.log(`Mapped "${fieldName}" to true (required checkbox)`);
        continue;
      }

      // Handle file fields (e.g., resume)
      if (fieldType === "file") {
        if (
          fieldNameLower.includes("resume") ||
          fieldNameLower.includes("cv") ||
          fieldLabelLower.includes("resume") ||
          fieldLabelLower.includes("cv")
        ) {
          if (resume && resume.fileData) {
            formData[fieldName] = resume.fileData;
            console.log(`Mapped "${fieldName}" to resume file data`);
          } else {
            console.warn(`No resume data available for "${fieldName}"`);
          }
        } else {
          console.log(
            `Skipping non-resume file field: ${fieldName} (${fieldLabel})`,
          );
        }
        continue;
      }

      // Special handling for known problematic QA fields in GOVX application
      if (fieldName === 'QA_9822728' || fieldName === 'QA_9822729') {
        console.log(`🔍 Special handling for known problematic field "${fieldName}"`);
        // These fields have SVG issues with "Personal information" labels
        // For these fields, we select the first option to get past required field validation
        if (field.options && field.options.length > 0) {
          // Always use the first option for these fields
          formData[fieldName] = field.options[0].value;
          console.log(`✅ Mapped problematic SVG field "${fieldName}" to first option "${field.options[0].value}"`);
          
          // Add extra context for the playwright worker to help with radio selection
          formData[`${fieldName}_questcontext`] = "Personal information radio field, force select first option";
          continue;
        }
      }
      
      // Special handling for work authorization field (QA_9822727)
      if (fieldName === 'QA_9822727' || (fieldLabelLower.includes('authorized') && fieldLabelLower.includes('work'))) {
        console.log(`🔍 Special handling for work authorization field "${fieldName}"`);
        // For this field, we need to get the first option's value for "Yes" rather than hardcoding "CA"
        if (field.options && field.options.length > 0) {
          // Find the "yes" or "authorized" option
          interface FieldOption {
            label: string;
            value: string;
          }

          const yesOption: FieldOption | undefined = (field.options as FieldOption[]).find((opt: FieldOption) => 
            (opt.label && (
              opt.label.toLowerCase().includes('yes') || 
              opt.label.toLowerCase().includes('authorized') ||
              opt.label.toLowerCase().includes('eligible')
            ))
          );
          
          if (yesOption) {
            formData[fieldName] = yesOption.value;
            // Add extra context for the playwright worker to help with radio selection
            formData[`${fieldName}_questcontext`] = "Work authorization field, select 'Yes' option";
            console.log(`✅ Mapped work auth field "${fieldName}" to "${yesOption.value}" (option: "${yesOption.label}")`);
            continue;
          } else {
            // If we can't find a specific "yes" option, use the first option as fallback
            formData[fieldName] = field.options[0].value;
            // Add extra context for the playwright worker to help with radio selection
            formData[`${fieldName}_questcontext`] = "Work authorization field, select first option";
            console.log(`✅ Mapped work auth field "${fieldName}" to first option "${field.options[0].value}" (fallback)`);
            continue;
          }
        } else {
          // If no options available, we should set a non-location value
          formData[fieldName] = "Yes";
          console.log(`✅ Mapped work auth field "${fieldName}" to "Yes" (no options available)`);
          continue;
        }
      }
      
      // Check if it's a basic field
      let isBasicField = false;
      for (const [key, mapping] of Object.entries(basicFieldMappings)) {
        if (
          mapping.keys.some(
            (k) => fieldNameLower.includes(k) || fieldLabelLower.includes(k),
          )
        ) {
          const value = mapping.value(user, profile);
          if (value) {
            formData[fieldName] = value;
            console.log(`Mapped "${fieldName}" to "${value}" (basic field)`);
            isBasicField = true;
          } else {
            console.warn(`No value available for basic field "${fieldName}"`);
          }
          break;
        }
      }
      if (isBasicField) continue;

      // Handle cover letter fields
      if (
        fieldType === "textarea" &&
        (fieldNameLower.includes("cover") ||
          fieldNameLower.includes("motivation") ||
          fieldLabelLower.includes("cover letter") ||
          fieldLabelLower.includes("motivation"))
      ) {
        try {
          const coverLetter = await generateCoverLetter(
            user,
            profile,
            job,
            matchScore,
          );
          formData[fieldName] = coverLetter;
          console.log(`Mapped "${fieldName}" to generated cover letter`);
        } catch (error) {
          console.error(
            `Error generating cover letter for "${fieldName}":`,
            error,
          );
          console.warn(
            `Skipping "${fieldName}" due to cover letter generation failure`,
          );
        }
        continue;
      }

      // Handle radio/select fields with options
      if (
        (fieldType === "radio" || fieldType === "select") &&
        field.options &&
        field.options.length > 0
      ) {
        try {
          // Check if this is a QA_* pattern field with context data
          const isQAPattern = fieldName && /^QA_\d+$/.test(fieldName);
          const hasQAContext = isQAPattern && field.isQAPattern && field.qaContext;
          
          if (isQAPattern) {
            if (hasQAContext) {
              console.log(`Processing QA_* pattern radio/select field "${fieldName}" with enhanced context`);
            } else {
              console.log(`Processing QA_* pattern radio/select field "${fieldName}" without enhanced context`);
            }
          }
          
          // For QA_* pattern fields, enhance the label with context data
          let enhancedLabel = fieldLabel;
          
          if (hasQAContext) {
            const contextParts = [];
            
            // Special handling for SVG issues
            if (field.qaContext.hasSvgProblem) {
              console.log(`⚠️ Field ${fieldName} has SVG label problem - using enhanced context`);
            }
            
            // Use more reliable context sources first in QA_* fields
            
            // Special alternative label for SVG problems
            if (field.qaContext.alternativeLabel) {
              contextParts.push(`Question from nearby label: ${field.qaContext.alternativeLabel}`);
            }
            
            // Question from fieldset
            if (field.qaContext.fieldsetQuestion) {
              contextParts.push(`Question from parent element: ${field.qaContext.fieldsetQuestion}`);
            }
            
            // Question from specialized question-text spans  
            if (field.qaContext.questionText) {
              contextParts.push(`Question: ${field.qaContext.questionText}`);
            }
            
            // Work authorization special handling
            if (field.qaContext.isWorkAuth) {
              contextParts.push("This appears to be a work authorization question asking if the candidate is legally authorized to work.");
            }
            
            // Add any section headings for overall context
            if (field.qaContext.sectionHeadings && field.qaContext.sectionHeadings.length > 0) {
              contextParts.push(`Section: ${field.qaContext.sectionHeadings[0]}`);
            }
            
            // Add sibling text that might contain question context
            if (field.qaContext.siblingText && field.qaContext.siblingText.length > 0) {
              contextParts.push(`Question context: ${field.qaContext.siblingText.join(' ')}`);
            }
            
            // Add any other labels found
            if (field.qaContext.parentLabel) {
              contextParts.push(`Related label: ${field.qaContext.parentLabel}`);
            }
            
            if (field.qaContext.ariaLabel || field.qaContext.idLabel || field.qaContext.siblingLabel) {
              const otherLabels = [field.qaContext.ariaLabel, field.qaContext.idLabel, field.qaContext.siblingLabel].filter(l => l).join(', ');
              if (otherLabels) {
                contextParts.push(`Additional context: ${otherLabels}`);
              }
            }
            
            // If we have any contextual data, enhance the label
            if (contextParts.length > 0) {
              enhancedLabel = `${contextParts.join('\n')}\n\nOriginal question field text: ${fieldLabel}`;
              console.log(`Enhanced label for QA_* radio/select field: ${enhancedLabel}`);
            }
          }
          
          console.log(
            `Using AI to select best option for "${fieldName}" (${enhancedLabel})`,
          );
          const resumeText = user.resumeText || "";
          const bestOptionIndex = await selectBestOptionWithAI(
            enhancedLabel,
            field.options,
            resumeText,
            profile || {},
            job.description,
            fieldName,
            hasQAContext ? field.qaContext : undefined
          );
          formData[fieldName] = field.options[bestOptionIndex].value;
          console.log(
            `Mapped "${fieldName}" to option ${bestOptionIndex + 1}: "${formData[fieldName]}"`,
          );
        } catch (error) {
          console.error(`Error selecting option for "${fieldName}":`, error);
          formData[fieldName] = field.options[0].value;
          console.log(
            `Mapped "${fieldName}" to first option (fallback): "${formData[fieldName]}"`,
          );
        }
        continue;
      }

      // Handle text/textarea fields (e.g., QA_ questions)
      if (fieldType === "text" || fieldType === "textarea") {
        try {
          // Check if this is a QA_* pattern field with context data
          const isQAPattern = fieldName && /^QA_\d+$/.test(fieldName);
          const hasQAContext = isQAPattern && field.isQAPattern && field.qaContext;
          
          if (isQAPattern) {
            if (hasQAContext) {
              console.log(`Processing QA_* pattern field "${fieldName}" with enhanced context`);
            } else {
              console.log(`Processing QA_* pattern field "${fieldName}" without enhanced context`);
            }
          }
          
          const answer = await generateApplicationAnswer(
            fieldLabel,
            fieldName,
            user.resumeText || "",
            profile || {},
            job.description,
            hasQAContext ? field.qaContext : undefined,
          );
          
          if (answer) {
            formData[fieldName] = answer;
            console.log(
              `Mapped "${fieldName}" to LLM-generated answer: "${answer.substring(0, 50)}..."`,
            );
          } else {
            console.warn(
              `LLM returned no answer for "${fieldName}" (${fieldLabel})`,
            );
            formData[fieldName] =
              `I am well-suited for the ${job.jobTitle} role at ${job.company} and would be happy to discuss this further.`;
            console.log(`Mapped "${fieldName}" to fallback answer`);
          }
        } catch (error) {
          console.error(
            `Error generating LLM answer for "${fieldName}":`,
            error,
          );
          formData[fieldName] =
            `I am well-suited for the ${job.jobTitle} role at ${job.company} and would be happy to discuss this further.`;
          console.log(`Mapped "${fieldName}" to fallback answer (error)`);
        }
        continue;
      }

      console.log(
        `Skipping unmapped field: ${fieldName} (type: ${fieldType}, label: ${fieldLabel})`,
      );
    }

    // Add resume metadata for the Playwright worker
    if (resume && resume.fileData) {
      formData.resume = resume.fileData;
      formData.resumeFilePath = "__BASE64_ENCODED__";
      formData.resumeContentType = "application/pdf";
      formData.resumeFilename = resume.filename || "resume.pdf";
      formData.isResumeBase64 = true;
      console.log(`Added resume metadata to formData`);
    }

    // Validate before submission: Ensure all required fields have values
    const requiredFieldsMissing: string[] = [];
    
    // Check all required fields
    for (const field of formSchema.fields) {
      // Skip file type fields as they're handled separately
      if (field.type === 'file') continue;
      
      // Get the field name
      const fieldName = field.name || field.id || '';
      
      // Check if field is required and missing in formData
      if (field.required && 
          (formData[fieldName] === undefined || 
           formData[fieldName] === null || 
           formData[fieldName] === '')) {
        requiredFieldsMissing.push(`${fieldName} (${field.label || 'no label'})`);
      }
    }
    
    // Check if any required fields are missing
    if (requiredFieldsMissing.length > 0) {
      console.error(`Validation failed: Missing values for required fields: ${requiredFieldsMissing.join(', ')}`);
      const missingFieldsError = `Missing values for required fields: ${requiredFieldsMissing.join(', ')}`;
      throw new Error(missingFieldsError);
    }
    
    console.log("✅ Pre-submission validation passed: All required fields have values");
    
    // Filter out selector fields from form data before submission
    // These are just helper fields used for targeting elements, not actual form fields
    const filteredFormData = Object.entries(formData).reduce((acc, [key, value]) => {
      // Skip any keys ending with "_selector" since they're only for targeting elements, not submission data
      if (!key.endsWith('_selector')) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    
    console.log(`Filtered out ${Object.keys(formData).length - Object.keys(filteredFormData).length} selector metadata fields from form submission`);
    
    // Prepare the payload to submit to the Playwright worker's /submit endpoint
    const payload = {
      job: {
        applyUrl: job.applyUrl,
      },
      formData: filteredFormData,
    };

    // Log form data for debugging (excluding resume data which is too large)
    const formDataForLogging = JSON.parse(JSON.stringify(formData));
    if (formDataForLogging.resume) {
      formDataForLogging.resume = "[RESUME DATA TRUNCATED]";
    }
    if (
      formDataForLogging.resumeFilePath &&
      typeof formDataForLogging.resumeFilePath === "string" &&
      formDataForLogging.resumeFilePath.startsWith("base64://")
    ) {
      formDataForLogging.resumeFilePath = "[BASE64 RESUME DATA TRUNCATED]";
    }
    Object.keys(formDataForLogging).forEach((key) => {
      if (typeof formDataForLogging[key] === "string") {
        if (
          formDataForLogging[key].length > 1000 &&
          formDataForLogging[key].includes("JVBERi0")
        ) {
          formDataForLogging[key] =
            `[LARGE BASE64 PDF DATA (${formDataForLogging[key].length} chars) TRUNCATED]`;
        } else if (formDataForLogging[key].length > 1000) {
          formDataForLogging[key] =
            `[LARGE STRING DATA (${formDataForLogging[key].length} chars) TRUNCATED]`;
        }
      } else if (
        formDataForLogging[key] &&
        typeof formDataForLogging[key] === "object"
      ) {
        Object.keys(formDataForLogging[key]).forEach((nestedKey) => {
          if (
            typeof formDataForLogging[key][nestedKey] === "string" &&
            formDataForLogging[key][nestedKey].length > 1000
          ) {
            formDataForLogging[key][nestedKey] =
              `[LARGE NESTED DATA (${formDataForLogging[key][nestedKey].length} chars) TRUNCATED]`;
          }
        });
      }
    });

    console.log(`Form data for ${job.jobTitle} at ${job.company} (truncated):`);
    const formDataString = JSON.stringify(formDataForLogging, null, 2);
    console.log(
      formDataString.length > 2000
        ? formDataString.substring(0, 2000) + "... [truncated]"
        : formDataString,
    );

    const response = await fetch(`${completeWorkerUrl}/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(
        `Submission request failed with status: ${response.status}`,
      );
      
      // Check the content type of the response
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        // Try to parse as JSON
        try {
          const errorData = await response.json();
          console.error("Error details:", errorData);
          
          // Include field statistics if available
          if (errorData.fieldStats) {
            console.error("Field stats:", errorData.fieldStats);
          }
          
          if (errorData.status === "skipped") {
            return "skipped";
          }
        } catch (parseError) {
          console.error("Error parsing JSON error response:", parseError);
        }
      } else {
        // Handle HTML or other formats - save the first part of the response for debugging
        try {
          const responseText = await response.text();
          console.error(`Received non-JSON error response (${contentType}). Response preview:`);
          console.error(responseText.substring(0, 1000) + (responseText.length > 1000 ? '...' : ''));
          
          // Log error for reference
          console.error(`Full error response length: ${responseText.length} characters`);
          console.error(`Error response preview: ${responseText.substring(0, 500)}...`);
        } catch (textError) {
          console.error("Error extracting text from error response:", textError);
        }
      }
      
      return "error";
    }

    // Handle JSON or HTML response properly
    let result;
    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('application/json')) {
      // Normal JSON response
      result = await response.json();
    } else {
      // Handle HTML or other non-JSON responses (typically 500 errors or redirects)
      const responseText = await response.text();
      console.error(`Received non-JSON response (${contentType}). First 500 chars of response:`);
      console.error(responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
      
      // Create a synthetic result object to handle the error
      result = {
        status: "fail",
        error: `Server returned non-JSON response (${response.status} ${response.statusText})`,
        htmlSnippet: responseText.substring(0, 200) + '...'
      };
    }
    
    // Check for field status information in the response
    if (result.fieldStats) {
      const stats = result.fieldStats;
      console.log(`
Form Field Processing Statistics:
--------------------------------
Total fields: ${stats.total}
Processed fields: ${stats.processed}
Successfully filled: ${stats.successful}
Failed to fill: ${stats.failed}
Skipped fields: ${stats.skipped}
Success rate: ${stats.successRate}%
      `);
      
      // Log details of any failed fields for debugging and improvement
      if (result.fieldDetails && stats.failed > 0) {
        const failedFields = result.fieldDetails.filter((field: any) => field.status === 'failed');
        console.error(`
Failed Fields Details:
---------------------
${failedFields.map((field: any) => 
  `${field.fieldName} (${field.type}): ${field.reason || 'Unknown reason'}`
).join('\n')}
        `);
      }
    }
    
    if (result.status === "success") {
      console.log(
        `Application successfully submitted for ${job.jobTitle} at ${job.company}`,
      );
      return "success";
    } else if (result.status === "skipped") {
      console.log(
        `Application skipped: ${result.message || "No reason provided"}`,
      );
      return "skipped";
    } else {
      console.error(`Unexpected result status: ${result.status}`);
      return "error";
    }
  } catch (error) {
    console.error(
      "Error in Workable schema-driven application process:",
      error,
    );
    
    // Log specific information about field validation failures
    if (error instanceof Error && error.message.includes('Missing values for required fields')) {
      console.error('❌ Application failed due to missing required fields');
    }
    
    return "error";
  }
  
  // Log end of process marker for easier log parsing
  console.log(`📊 Application process for ${job.jobTitle} at ${job.company} completed.`);
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
