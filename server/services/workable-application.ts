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
  selectBestOptionWithAI,
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
  matchScore: number,
): Promise<"success" | "skipped" | "error"> {
  try {
    console.log(
      `Processing Workable application using schema-driven approach for ${job.jobTitle} at ${job.company}`,
    );

    // Check if we have a worker URL configured
    const workerUrl = process.env.PLAYWRIGHT_WORKER_URL;
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
          console.log(
            `Using AI to select best option for "${fieldName}" (${fieldLabel})`,
          );
          const resumeText = user.resumeText || "";
          const bestOptionIndex = await selectBestOptionWithAI(
            fieldLabel,
            field.options,
            resumeText,
            profile || {},
            job.description,
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
          const answer = await generateApplicationAnswer(
            fieldLabel,
            fieldName,
            user.resumeText || "",
            profile || {},
            job.description,
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

    // Prepare the payload to submit to the Playwright worker's /submit endpoint
    const payload = {
      job: {
        applyUrl: job.applyUrl,
      },
      formData,
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
      try {
        const errorData = await response.json();
        console.error("Error details:", errorData);
        if (errorData.status === "skipped") {
          return "skipped";
        }
      } catch (parseError) {
        console.error("Error parsing error response:", parseError);
      }
      return "error";
    }

    const result = await response.json();
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
    return "error";
  }
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
