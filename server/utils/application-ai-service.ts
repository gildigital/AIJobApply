/**
 * Application AI Service - Enhanced answer generation for job applications
 * 
 * This service uses AI to generate tailored responses for job application questions,
 * select optimal choices from multiple-choice questions, and create custom cover 
 * letters based on the user's profile and job description.
 */

// API keys from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Check if required API keys are available
const hasOpenAIKey = !!OPENAI_API_KEY;
const hasAnthropicKey = !!ANTHROPIC_API_KEY;

// Warn on startup if keys are missing
if (!hasOpenAIKey && !hasAnthropicKey) {
  console.warn("WARNING: No AI service API keys found (OPENAI_API_KEY or ANTHROPIC_API_KEY). Application answers will be limited.");
}

/**
 * Validates an AI-generated response to ensure quality
 * 
 * @param question The original question
 * @param response The AI-generated response
 * @returns boolean indicating whether the response passes validation
 */
function validateAIResponse(question: string, response: string): boolean {
  // Don't validate null/undefined responses (handled by calling code)
  if (!response) return false;
  
  // Trim whitespace
  const trimmedResponse = response.trim();
  
  // Basic validation: Minimum length check (adjust threshold based on field type)
  const isShortQuestion = question.length < 30;
  const minLength = isShortQuestion ? 5 : 20; // Short responses for short questions
  if (trimmedResponse.length < minLength) {
    console.warn(`❌ AI response failed validation: Too short (${trimmedResponse.length} chars) for question: "${question}"`);
    return false;
  }
  
  // Check for placeholder markers that might indicate incomplete responses
  const placeholderPatterns = [
    /\[.*?\]/,                     // Text in square brackets
    /\(insert.*?\)/i,              // "insert" in parentheses
    /\{.*?\}/,                     // Text in curly braces
    /<.*?>/,                       // Text in angle brackets
    /your\s+[a-z]+(\s+here)?/i,    // "your X" or "your X here"
    /insert\s+[a-z]+(\s+here)?/i,  // "insert X" or "insert X here"
  ];
  
  for (const pattern of placeholderPatterns) {
    if (pattern.test(trimmedResponse)) {
      console.warn(`❌ AI response failed validation: Contains placeholder pattern "${pattern}" for question: "${question}"`);
      return false;
    }
  }
  
  // Check for nonsensical/generic responses (modify as needed)
  const genericResponses = [
    "N/A",
    "Not applicable",
    "I don't know",
    "I am not sure",
    "Please provide more information"
  ];
  
  // If the question requires a substantive answer
  if (question.length > 30 && !question.endsWith("?")) {
    // Check if the response is just one of the generic responses
    if (genericResponses.some(generic => trimmedResponse === generic)) {
      console.warn(`❌ AI response failed validation: Generic response "${trimmedResponse}" for question: "${question}"`);
      return false;
    }
  }
  
  // All checks passed
  return true;
}

/**
 * Generate a tailored answer for a specific job application question
 * 
 * @param question The question text from the application form
 * @param fieldName The field name or identifier from the form
 * @param resumeText The user's resume text for context
 * @param userProfile Additional user profile information
 * @param jobDescription The job description for context
 * @param qaContext Optional context data for QA_* pattern fields
 * @returns Promise resolving to a generated answer
 */
export async function generateApplicationAnswer(
  question: string,
  fieldName: string,
  resumeText: string,
  userProfile: any,
  jobDescription: string,
  qaContext?: any
): Promise<string> {
  // Determine field type and use specialized prompts when appropriate
  const fieldNameLower = fieldName.toLowerCase();
  const questionLower = question.toLowerCase();
  
  // Check if this is a QA_* pattern field that might need extra context
  const isQAPattern = fieldName && /^QA_\d+$/.test(fieldName);
  
  // Special handling for work authorization questions to prevent "CA" fallback
  const isWorkAuthQuestion = 
    questionLower.includes('authorized to work') || 
    questionLower.includes('work authorization') || 
    questionLower.includes('eligible to work') || 
    questionLower.includes('legally') && questionLower.includes('work') ||
    questionLower.includes('right to work') ||
    questionLower.includes('sponsorship') ||
    questionLower.includes('work permit') ||
    (isQAPattern && qaContext?.isWorkAuth);
    
  if (isWorkAuthQuestion) {
    console.log(`🔍 Detected work authorization question: "${question}" (${fieldName})`);
    return "Yes, I am legally authorized to work in this country without sponsorship.";
  }
  
  // Cover letter generation needs special handling
  if (fieldNameLower.includes('cover_letter') || 
      questionLower.includes('cover letter') || 
      questionLower.includes('why do you want to work')) {
    const coverLetter = await generateCoverLetter(resumeText, userProfile, jobDescription);
    
    // Validate the cover letter
    if (validateAIResponse(question, coverLetter)) {
      return coverLetter;
    } else {
      console.warn(`Cover letter validation failed for field "${fieldName}" - using fallback`);
      return getGenericCoverLetter(userProfile, jobDescription);
    }
  }
  
  // Enhanced context with surrounding text for QA_* pattern fields
  let enhancedQuestion = question;
  let enhancedPrompt = false;
  
  if (isQAPattern && qaContext) {
    console.log(`Processing QA_* pattern field: ${fieldName} with enhanced context`);
    
    // Check for problematic SVG labels and flag if found
    const hasSvgProblem = qaContext.hasSvgProblem || false;
    if (hasSvgProblem) {
      console.log(`⚠️ Field ${fieldName} has SVG label problem - using enhanced context`);
    }
    
    // Build a richer context string from available context data
    const contextParts = [];
    
    // Use more reliable context sources first in QA_* fields
    
    // Special alternative label for SVG problems
    if (qaContext.alternativeLabel) {
      contextParts.push(`Question from nearby label: ${qaContext.alternativeLabel}`);
    }
    
    // Question from fieldset
    if (qaContext.fieldsetQuestion) {
      contextParts.push(`Question from parent element: ${qaContext.fieldsetQuestion}`);
    }
    
    // Question from specialized question-text spans  
    if (qaContext.questionText) {
      contextParts.push(`Question: ${qaContext.questionText}`);
    }
    
    // Work authorization special handling
    if (qaContext.isWorkAuth) {
      contextParts.push("This appears to be a work authorization question asking if the candidate is legally authorized to work.");
    }
    
    // Add any section headings for overall context
    if (qaContext.sectionHeadings && qaContext.sectionHeadings.length > 0) {
      contextParts.push(`Section: ${qaContext.sectionHeadings[0]}`);
    }
    
    // Add sibling text that might contain question context
    if (qaContext.siblingText && qaContext.siblingText.length > 0) {
      contextParts.push(`Question context: ${qaContext.siblingText.join(' ')}`);
    }
    
    // Add any other labels found
    if (qaContext.parentLabel) {
      contextParts.push(`Related label: ${qaContext.parentLabel}`);
    }
    
    if (qaContext.ariaLabel || qaContext.idLabel || qaContext.siblingLabel) {
      const otherLabels = [qaContext.ariaLabel, qaContext.idLabel, qaContext.siblingLabel].filter(l => l).join(', ');
      if (otherLabels) {
        contextParts.push(`Additional context: ${otherLabels}`);
      }
    }
    
    // If we have any contextual data, enhance the question
    if (contextParts.length > 0) {
      enhancedQuestion = `${contextParts.join('\n')}\n\nOriginal question field text: ${question}`;
      enhancedPrompt = true;
      console.log(`Enhanced question from surrounding context: ${enhancedQuestion}`);
    }
  }
  
  // Try OpenAI first if key is available
  if (OPENAI_API_KEY) {
    try {
      const openAIResponse = await generateAnswerWithOpenAI(
        enhancedQuestion, 
        fieldName, 
        resumeText, 
        userProfile, 
        jobDescription,
        enhancedPrompt
      );
      
      // For QA pattern fields, use more lenient validation
      const shouldValidate = !isQAPattern || !enhancedPrompt;
      
      // Validate OpenAI response (if not a QA field with enhanced context)
      if (!shouldValidate || validateAIResponse(enhancedQuestion, openAIResponse)) {
        return openAIResponse;
      } else {
        console.warn(`OpenAI response validation failed for question "${question}" - trying Anthropic`);
        
        // If OpenAI validation fails, try Anthropic as fallback (if available)
        if (ANTHROPIC_API_KEY) {
          const anthropicResponse = await generateAnswerWithAnthropic(
            enhancedQuestion, 
            fieldName, 
            resumeText, 
            userProfile, 
            jobDescription,
            enhancedPrompt
          );
          
          // Validate Anthropic response (if not a QA field with enhanced context)
          if (!shouldValidate || validateAIResponse(enhancedQuestion, anthropicResponse)) {
            return anthropicResponse;
          }
        }
        
        // Both APIs failed validation, return a generic answer
        console.warn(`All AI responses failed validation for question "${question}" - using generic answer`);
        return getGenericAnswer(question, fieldName);
      }
    } catch (error) {
      console.error("Error with OpenAI answer generation:", error);
      
      // If Anthropic is available, try it as fallback
      if (ANTHROPIC_API_KEY) {
        try {
          const anthropicResponse = await generateAnswerWithAnthropic(
            enhancedQuestion, 
            fieldName, 
            resumeText, 
            userProfile, 
            jobDescription,
            enhancedPrompt
          );
          
          // For QA pattern fields, use more lenient validation
          const shouldValidate = !isQAPattern || !enhancedPrompt;
          
          // Validate Anthropic response (if not a QA field with enhanced context)
          if (!shouldValidate || validateAIResponse(enhancedQuestion, anthropicResponse)) {
            return anthropicResponse;
          } else {
            console.warn(`Anthropic response validation failed for question "${question}" - using generic answer`);
          }
        } catch (anthropicError) {
          console.error("Error with Anthropic answer generation:", anthropicError);
        }
      }
      
      // If no AI services available or all failed, return a generic answer
      return getGenericAnswer(question, fieldName);
    }
  } 
  // If no OpenAI key but Anthropic is available, use Anthropic
  else if (ANTHROPIC_API_KEY) {
    try {
      const anthropicResponse = await generateAnswerWithAnthropic(
        enhancedQuestion, 
        fieldName, 
        resumeText, 
        userProfile, 
        jobDescription,
        enhancedPrompt
      );
      
      // For QA pattern fields, use more lenient validation
      const shouldValidate = !isQAPattern || !enhancedPrompt;
      
      // Validate Anthropic response (if not a QA field with enhanced context)
      if (!shouldValidate || validateAIResponse(enhancedQuestion, anthropicResponse)) {
        return anthropicResponse;
      } else {
        console.warn(`Anthropic response validation failed for question "${question}" - using generic answer`);
        return getGenericAnswer(question, fieldName);
      }
    } catch (error) {
      console.error("Error with Anthropic answer generation:", error);
      return getGenericAnswer(question, fieldName);
    }
  } 
  // If no AI services are available, return a generic answer
  else {
    return getGenericAnswer(question, fieldName);
  }
}

/**
 * Generate a cover letter based on user profile and job description
 * 
 * @param resumeText The user's resume text
 * @param userProfile The user's profile information
 * @param jobDescription The job description
 * @returns Promise resolving to a generated cover letter
 */
export async function generateCoverLetter(
  resumeText: string,
  userProfile: any,
  jobDescription: string
): Promise<string> {
  // Try OpenAI first if key is available
  if (OPENAI_API_KEY) {
    try {
      return await generateCoverLetterWithOpenAI(resumeText, userProfile, jobDescription);
    } catch (error) {
      console.error("Error with OpenAI cover letter generation:", error);
      
      // If Anthropic is available, try it as fallback
      if (ANTHROPIC_API_KEY) {
        return await generateCoverLetterWithAnthropic(resumeText, userProfile, jobDescription);
      }
      
      // If no AI services available, return a generic cover letter
      return getGenericCoverLetter(userProfile, jobDescription);
    }
  } 
  // If no OpenAI key but Anthropic is available, use Anthropic
  else if (ANTHROPIC_API_KEY) {
    return await generateCoverLetterWithAnthropic(resumeText, userProfile, jobDescription);
  } 
  // If no AI services are available, return a generic cover letter
  else {
    return getGenericCoverLetter(userProfile, jobDescription);
  }
}

/**
 * Generate an application answer using OpenAI
 */
async function generateAnswerWithOpenAI(
  question: string, 
  fieldName: string, 
  resumeText: string, 
  userProfile: any, 
  jobDescription: string,
  isEnhancedQAPrompt: boolean = false
): Promise<string> {
  // Build a compact user profile summary
  const profileSummary = buildProfileSummary(userProfile);
  
  // Define the prompt
  let systemPrompt = `You are an expert job application assistant. Create a tailored, professional answer for a job application question.
  
Your answer should:
1. Be concise and directly address the question
2. Highlight relevant skills and experience from the resume
3. Connect the applicant's background to the job requirements
4. Be professional and positive in tone
5. Be truthful based on the resume content (don't fabricate experience)
6. IMPORTANT: Use ONLY concrete details from the resume - DO NOT use placeholders like [insert experience] or [company name]
7. IMPORTANT: If you don't have specific information, use generalized statements rather than placeholders
8. IMPORTANT: Never use brackets [] or phrases like "insert your" in the answer

Return ONLY the answer text, without quotes or explanations.
Keep answers under 100 words unless it's for a complex question that requires more detail.`;

  // For QA_* pattern fields with enhanced context, give more specific instructions
  if (isEnhancedQAPrompt) {
    systemPrompt += `\n\nThis is a multiple-choice question with a generic field name (QA_* pattern). 
I've provided enhanced context that might help you understand what the question is about.
The context may include section headings, nearby text that provides clues about the question topic,
and other contextual information. Use this context to infer what the question is asking and provide an appropriate response.
When you're uncertain, choose a balanced response that doesn't overpromise or limit the applicant's opportunities.`;
  }

  const isQAPattern = fieldName && /^QA_\d+$/.test(fieldName);
  const formattedFieldName = isQAPattern ? 
    `${fieldName} (generic field name, look at enhanced context for more information)` : 
    fieldName;

  const userPrompt = `# QUESTION: 
${question} (field name: ${formattedFieldName})

# RESUME EXCERPT:
${resumeText.substring(0, 1500)}

# USER PROFILE:
${profileSummary}

# JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 1000)}

${isEnhancedQAPrompt ? "Please use the enhanced context to understand what this question is about and provide an appropriate response." : ""}
Please provide a professional answer to this application question.`;

  // Make the API request to OpenAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.5,
      max_tokens: 300
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Generate an application answer using Anthropic
 */
async function generateAnswerWithAnthropic(
  question: string, 
  fieldName: string, 
  resumeText: string, 
  userProfile: any, 
  jobDescription: string,
  isEnhancedQAPrompt: boolean = false
): Promise<string> {
  // Build a compact user profile summary
  const profileSummary = buildProfileSummary(userProfile);
  
  // Define the prompt
  let instructionsContent = `
You are an expert job application assistant. Create a tailored, professional answer for a job application question.

Your answer should:
1. Be concise and directly address the question
2. Highlight relevant skills and experience from the resume
3. Connect the applicant's background to the job requirements
4. Be professional and positive in tone
5. Be truthful based on the resume content (don't fabricate experience)
6. IMPORTANT: Use ONLY concrete details from the resume - DO NOT use placeholders like [insert experience] or [company name]
7. IMPORTANT: If you don't have specific information, use generalized statements rather than placeholders
8. IMPORTANT: Never use brackets [] or phrases like "insert your" in the answer

Return ONLY the answer text, without quotes or explanations.
Keep answers under 100 words unless it's for a complex question that requires more detail.`;

  // For QA_* pattern fields with enhanced context, give more specific instructions
  if (isEnhancedQAPrompt) {
    instructionsContent += `\n\nThis is a multiple-choice question with a generic field name (QA_* pattern). 
I've provided enhanced context that might help you understand what the question is about.
The context may include section headings, nearby text that provides clues about the question topic,
and other contextual information. Use this context to infer what the question is asking and provide an appropriate response.
When you're uncertain, choose a balanced response that doesn't overpromise or limit the applicant's opportunities.`;
  }

  const isQAPattern = fieldName && /^QA_\d+$/.test(fieldName);
  const formattedFieldName = isQAPattern ? 
    `${fieldName} (generic field name, look at enhanced context for more information)` : 
    fieldName;

  const prompt = `
<instructions>
${instructionsContent}
</instructions>

# QUESTION: 
${question} (field name: ${formattedFieldName})

# RESUME EXCERPT:
${resumeText.substring(0, 1500)}

# USER PROFILE:
${profileSummary}

# JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 1000)}

${isEnhancedQAPrompt ? "Please use the enhanced context to understand what this question is about and provide an appropriate response." : ""}
Please provide a professional answer to this application question.`;

  // Make the API request to Anthropic
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    } as HeadersInit,
    body: JSON.stringify({
      model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
      max_tokens: 300,
      system: "You generate professional job application answers based on user profiles and resumes. Never use placeholders in your responses - always use concrete details or general statements.",
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  
  return content.trim();
}

/**
 * Generate a cover letter using OpenAI
 */
async function generateCoverLetterWithOpenAI(
  resumeText: string, 
  userProfile: any, 
  jobDescription: string
): Promise<string> {
  // Build a compact user profile summary
  const profileSummary = buildProfileSummary(userProfile);
  
  // Company and job title from the job description
  const jobTitle = extractJobTitle(jobDescription);
  const company = extractCompany(jobDescription);
  
  // Define the prompt
  const systemPrompt = `You are an expert cover letter writer. Create a concise, compelling cover letter that:

1. Draws connections between the applicant's experience and the job requirements
2. Highlights key accomplishments relevant to the position
3. Maintains a professional, enthusiastic tone
4. Is truthful based on the resume content (don't fabricate experience)
5. Is less than 300 words (2-3 paragraphs max)
6. IMPORTANT: Uses ONLY concrete details from the resume - DO NOT use placeholders like [insert experience] or [company name]
7. IMPORTANT: If you don't have specific information, use generalized statements rather than placeholders

Return ONLY the cover letter text, without explanations. Do not include date, address, or signature lines.`;

  const userPrompt = `# JOB TITLE: 
${jobTitle || "The open position"}

# COMPANY:
${company || "The company"}

# RESUME EXCERPT:
${resumeText.substring(0, 1500)}

# USER PROFILE:
${profileSummary}

# JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 1000)}

Please write a concise, compelling cover letter.`;

  // Make the API request to OpenAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 700
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

/**
 * Generate a cover letter using Anthropic
 */
async function generateCoverLetterWithAnthropic(
  resumeText: string, 
  userProfile: any, 
  jobDescription: string
): Promise<string> {
  // Build a compact user profile summary
  const profileSummary = buildProfileSummary(userProfile);
  
  // Company and job title from the job description
  const jobTitle = extractJobTitle(jobDescription);
  const company = extractCompany(jobDescription);
  
  // Define the prompt
  const prompt = `
<instructions>
You are an expert cover letter writer. Create a concise, compelling cover letter that:

1. Draws connections between the applicant's experience and the job requirements
2. Highlights key accomplishments relevant to the position
3. Maintains a professional, enthusiastic tone
4. Is truthful based on the resume content (don't fabricate experience)
5. Is less than 300 words (2-3 paragraphs max)
6. IMPORTANT: Uses ONLY concrete details from the resume - DO NOT use placeholders like [insert experience] or [company name]
7. IMPORTANT: If you don't have specific information, use generalized statements rather than placeholders
8. IMPORTANT: Do not include lines like "In my previous role at [Previous Company Name]" - either use the actual company name from the resume or use a general phrase like "In my previous roles"

Return ONLY the cover letter text, without explanations. Do not include date, address, or signature lines.
</instructions>

# JOB TITLE: 
${jobTitle || "The open position"}

# COMPANY:
${company || "The company"}

# RESUME EXCERPT:
${resumeText.substring(0, 1500)}

# USER PROFILE:
${profileSummary}

# JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 1000)}

Please write a concise, compelling cover letter.`;

  // Make the API request to Anthropic
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    } as HeadersInit,
    body: JSON.stringify({
      model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
      max_tokens: 700,
      system: "You write professional cover letters based on user profiles and job descriptions. Never use placeholders in your responses - always use concrete details or general statements.",
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  const content = data.content[0].text;
  
  return content.trim();
}

/**
 * Build a compact user profile summary string from profile object
 */
function buildProfileSummary(userProfile: any): string {
  if (!userProfile) return "No profile information available.";
  
  const summary = [];
  
  // Add basic profile information
  if (userProfile.fullName) summary.push(`Name: ${userProfile.fullName}`);
  if (userProfile.email) summary.push(`Email: ${userProfile.email}`);
  if (userProfile.phoneNumber) summary.push(`Phone: ${userProfile.phoneNumber}`);
  if (userProfile.location) summary.push(`Location: ${userProfile.location}`);
  
  // Add education info if available
  if (userProfile.education && Array.isArray(userProfile.education)) {
    summary.push("Education:");
    userProfile.education.forEach((edu: any) => {
      const eduText = `- ${edu.degree || 'Degree'} from ${edu.institution || 'Institution'}${edu.graduationYear ? ` (${edu.graduationYear})` : ''}`;
      summary.push(eduText);
    });
  }
  
  // Add work experience info if available
  if (userProfile.workExperience && Array.isArray(userProfile.workExperience)) {
    summary.push("Work Experience:");
    userProfile.workExperience.forEach((exp: any) => {
      const expText = `- ${exp.role || 'Role'} at ${exp.company || 'Company'}${exp.startDate ? ` (${exp.startDate}` : ''}${exp.endDate ? ` to ${exp.endDate})` : exp.startDate ? ')' : ''}`;
      summary.push(expText);
    });
  }
  
  // Add skills if available
  if (userProfile.skills && Array.isArray(userProfile.skills)) {
    summary.push(`Skills: ${userProfile.skills.join(', ')}`);
  }
  
  return summary.join('\n');
}

/**
 * Extract job title from job description
 */
function extractJobTitle(jobDescription: string): string {
  // Simple extraction based on common patterns
  const patterns = [
    /job title:?\s*([^,\.\n]+)/i,
    /position:?\s*([^,\.\n]+)/i,
    /role:?\s*([^,\.\n]+)/i,
    /We are looking for[a\s]+([^,\.\n]+)/i,
    /hiring[a\s]+([^,\.\n]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = jobDescription.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return "";
}

/**
 * Extract company name from job description
 */
function extractCompany(jobDescription: string): string {
  // Simple extraction based on common patterns
  const patterns = [
    /company:?\s*([^,\.\n]+)/i,
    /at ([^,\.\n]+) we are/i,
    /About ([^,\.\n]+):/i,
    /([^,\.\n]+) is looking for/i,
    /Join ([^,\.\n]+) and/i
  ];
  
  for (const pattern of patterns) {
    const match = jobDescription.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return "";
}

/**
 * Select the best option from a multiple-choice field using AI
 * 
 * @param question The question text from the form
 * @param options An array of options to choose from
 * @param resumeText The user's resume text
 * @param userProfile The user's profile information
 * @param jobDescription The job description
 * @returns Promise resolving to the index of the best option
 */
export async function selectBestOptionWithAI(
  question: string,
  options: { label: string; value: string }[],
  resumeText: string,
  userProfile: any,
  jobDescription: string,
  fieldName?: string,
  qaContext?: any
): Promise<number> {
  // If no options or only one option, return the first one
  if (!options || options.length === 0) return 0;
  if (options.length === 1) return 0;
  
  // Default to first option if no AI available or for simple yes/no questions
  const questionLower = question.toLowerCase();
  const labels = options.map(opt => (opt.label || '').toLowerCase());
  
  // Detect if this is a QA_* pattern field
  const isQAPattern = fieldName && /^QA_\d+$/.test(fieldName);
  
  // Special handling for work authorization fields
  const isWorkAuthQuestion = 
    questionLower.includes('authorized to work') || 
    questionLower.includes('work authorization') || 
    questionLower.includes('eligible to work') || 
    (questionLower.includes('legally') && questionLower.includes('work')) ||
    questionLower.includes('right to work') ||
    questionLower.includes('sponsorship') ||
    questionLower.includes('work permit') ||
    (isQAPattern && qaContext?.isWorkAuth);
  
  if (isWorkAuthQuestion) {
    console.log(`🔍 Handling work authorization options selection for question: "${question}"`);
    
    // Look for "yes" option first for work authorization
    const yesIndex = labels.findIndex(l => l.includes('yes'));
    if (yesIndex >= 0) {
      console.log(`✅ Selected "yes" option for work authorization question`);
      return yesIndex;
    }
    
    // Look for other positive responses
    const positiveOptions = [
      'authorized', 'eligible', 'permitted', 'allowed', 'legal', 
      'citizen', 'permanent resident', 'green card'
    ];
    
    // Find the first positive option
    for (const positiveOption of positiveOptions) {
      const positiveIndex = labels.findIndex(l => l.includes(positiveOption));
      if (positiveIndex >= 0) {
        console.log(`✅ Selected positive option "${labels[positiveIndex]}" for work authorization question`);
        return positiveIndex;
      }
    }
    
    // If no clearly positive option found, avoid options with "sponsorship" or "visa"
    const negativeOptions = ['sponsorship', 'visa', 'sponsor', 'no'];
    const allNegative = labels.every(l => negativeOptions.some(neg => l.includes(neg)));
    if (!allNegative) {
      // Find first option that doesn't include negative terms
      const fallbackIndex = labels.findIndex(l => !negativeOptions.some(neg => l.includes(neg)));
      if (fallbackIndex >= 0) {
        console.log(`⚠️ Selected fallback option "${labels[fallbackIndex]}" for work authorization question`);
        return fallbackIndex;
      }
    }
  }
  
  // For yes/no questions, prefer "yes" when appropriate
  if (labels.some(l => l.includes('yes')) && labels.some(l => l.includes('no'))) {
    // Common questions where we default to "yes"
    const positiveQuestions = [
      'willing', 'background check', 'references', 'relocate', 'remote',
      'travel', 'overtime', 'flexible', 'weekend', 'shift', 'certification'
    ];
    
    // If it's a positive question, find the "yes" option
    if (positiveQuestions.some(term => questionLower.includes(term))) {
      const yesIndex = labels.findIndex(l => l.includes('yes'));
      if (yesIndex >= 0) return yesIndex;
    }
  }
  
  // Try AI selection if keys are available
  if (OPENAI_API_KEY) {
    try {
      return await selectOptionWithOpenAI(question, options, resumeText, userProfile, jobDescription);
    } catch (error) {
      console.error("Error with OpenAI option selection:", error);
      
      if (ANTHROPIC_API_KEY) {
        try {
          return await selectOptionWithAnthropic(question, options, resumeText, userProfile, jobDescription);
        } catch (error) {
          console.error("Error with Anthropic option selection:", error);
        }
      }
    }
  } else if (ANTHROPIC_API_KEY) {
    try {
      return await selectOptionWithAnthropic(question, options, resumeText, userProfile, jobDescription);
    } catch (error) {
      console.error("Error with Anthropic option selection:", error);
    }
  }
  
  // Default to first option if AI selection fails
  return 0;
}

/**
 * Select the best option using OpenAI
 */
async function selectOptionWithOpenAI(
  question: string,
  options: { label: string; value: string }[],
  resumeText: string,
  userProfile: any,
  jobDescription: string
): Promise<number> {
  // Format options for the prompt
  const formattedOptions = options.map((opt, idx) => 
    `${idx + 1}. ${opt.label || 'Unlabeled option'}`
  ).join('\n');
  
  // Build a compact user profile summary
  const profileSummary = buildProfileSummary(userProfile);
  
  // Define the prompt
  const systemPrompt = `You are an AI assistant helping with job applications. 
  
Your task is to select the BEST answer to a job application question from the provided options.

Output ONLY a single number corresponding to the option you select, without any explanation or additional text.
For example, if you choose option 3, just output: 3`;

  const userPrompt = `# QUESTION:
${question}

# OPTIONS:
${formattedOptions}

# RESUME EXCERPT:
${resumeText.substring(0, 1000)}

# USER PROFILE:
${profileSummary}

# JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 500)}

Based on the candidate's profile and the job requirements, select the BEST option number.
Output ONLY the number of your selection.`;

  // Make the API request to OpenAI
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 10
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();
  
  // Parse the response to get the selected option index
  const selectedNumber = parseInt(content.match(/\d+/)?.[0] || '1', 10);
  
  // Adjust for zero-indexing (options are displayed 1-based, but we need 0-based)
  return Math.min(Math.max(selectedNumber - 1, 0), options.length - 1);
}

/**
 * Select the best option using Anthropic
 */
async function selectOptionWithAnthropic(
  question: string,
  options: { label: string; value: string }[],
  resumeText: string,
  userProfile: any,
  jobDescription: string
): Promise<number> {
  // Format options for the prompt
  const formattedOptions = options.map((opt, idx) => 
    `${idx + 1}. ${opt.label || 'Unlabeled option'}`
  ).join('\n');
  
  // Build a compact user profile summary
  const profileSummary = buildProfileSummary(userProfile);
  
  // Define the prompt
  const prompt = `
<instructions>
You are an AI assistant helping with job applications. 

Your task is to select the BEST answer to a job application question from the provided options.

Output ONLY a single number corresponding to the option you select, without any explanation or additional text.
For example, if you choose option 3, just output: 3
</instructions>

# QUESTION:
${question}

# OPTIONS:
${formattedOptions}

# RESUME EXCERPT:
${resumeText.substring(0, 1000)}

# USER PROFILE:
${profileSummary}

# JOB DESCRIPTION EXCERPT:
${jobDescription.substring(0, 500)}

Based on the candidate's profile and the job requirements, select the BEST option number.
Output ONLY the number of your selection.`;

  // Make the API request to Anthropic
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    } as HeadersInit,
    body: JSON.stringify({
      model: "claude-3-7-sonnet-20250219", // the newest Anthropic model is "claude-3-7-sonnet-20250219" which was released February 24, 2025
      max_tokens: 10,
      system: "You help with job applications by selecting the most appropriate options from multiple choice questions. Never use placeholders in your responses - always use concrete details or general statements.",
      messages: [
        { role: "user", content: prompt }
      ]
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  const content = data.content[0].text.trim();
  
  // Parse the response to get the selected option index
  const selectedNumber = parseInt(content.match(/\d+/)?.[0] || '1', 10);
  
  // Adjust for zero-indexing (options are displayed 1-based, but we need 0-based)
  return Math.min(Math.max(selectedNumber - 1, 0), options.length - 1);
}

/**
 * Provide a generic answer when AI services are unavailable
 */
function getGenericAnswer(question: string, fieldName: string): string {
  // Return appropriate generic answers based on field type
  const fieldNameLower = fieldName.toLowerCase();
  const questionLower = question.toLowerCase();
  
  // Yes/No questions
  if (questionLower.includes('willing to relocate') || 
      questionLower.includes('relocation')) {
    return "Yes, I am open to relocation for the right opportunity.";
  }
  
  if (questionLower.includes('work authorization') || 
      questionLower.includes('authorized to work') ||
      questionLower.includes('require sponsorship')) {
    return "Yes, I am authorized to work in this country without sponsorship.";
  }
  
  if (questionLower.includes('background check')) {
    return "Yes, I am willing to undergo a background check.";
  }
  
  if (questionLower.includes('salary') || 
      questionLower.includes('compensation') ||
      fieldNameLower.includes('salary')) {
    return "My salary expectations are negotiable based on the total compensation package, but I'm looking in the range that's standard for this role in the industry.";
  }
  
  if (questionLower.includes('start date') || 
      questionLower.includes('when can you start')) {
    return "I can start within two weeks after receiving an offer.";
  }
  
  // For any other type of question, provide a generic response
  return "I would be happy to discuss this further in an interview.";
}

/**
 * Provide a generic cover letter when AI services are unavailable
 */
function getGenericCoverLetter(userProfile: any, jobDescription: string): string {
  const name = userProfile?.fullName || "Applicant";
  
  return `I am writing to express my interest in the open position at your company. With my background and skills, I believe I would be a valuable addition to your team.

My experience aligns well with the requirements outlined in the job description, and I am excited about the opportunity to contribute to your organization's success. I am particularly drawn to this role because it allows me to utilize my core strengths while taking on new challenges.

Thank you for considering my application. I look forward to the possibility of discussing how my background, skills, and experiences may benefit your organization.

Sincerely,
${name}`;
}