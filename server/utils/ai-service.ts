/**
 * AI Service - OpenAI and Anthropic integration for job matching
 */

// API keys from environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Response type for job matching
export interface MatchResult {
  matchScore: number; // 0-100 score
  reasons: string[]; // List of reasons explaining the match
}

// Check if required API keys are available
const hasOpenAIKey = !!process.env.OPENAI_API_KEY;
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

// Warn on startup if keys are missing
if (!hasOpenAIKey && !hasAnthropicKey) {
  console.warn("WARNING: No AI service API keys found (OPENAI_API_KEY or ANTHROPIC_API_KEY). Job matching will use fallback scoring.");
} else {
  console.log("AI scoring service available with:", 
    hasOpenAIKey ? "OpenAI" : "", 
    hasAnthropicKey ? (hasOpenAIKey ? " and Anthropic" : "Anthropic") : ""
  );
}

/**
 * Uses AI to match a resume with a job description and returns a match score and explanation
 * 
 * @param resumeText The parsed text of the user's resume
 * @param jobDescription The job description to match against
 * @returns Promise resolving to a match result with score and reasons
 */
export async function matchResumeToJob(resumeText: string, jobDescription: string): Promise<MatchResult> {
  // Try OpenAI first if key is available
  if (OPENAI_API_KEY) {
    try {
      console.log("Using OpenAI for job matching");
      return await matchWithOpenAI(resumeText, jobDescription);
    } catch (error) {
      console.error("Error with OpenAI matching:", error);
      
      // If Anthropic is available, try it as fallback
      if (ANTHROPIC_API_KEY) {
        console.log("Falling back to Anthropic for job matching");
        return await matchWithAnthropic(resumeText, jobDescription);
      }
      
      // If no fallback, re-throw the error
      throw error;
    }
  } 
  // If no OpenAI key but Anthropic is available, use Anthropic
  else if (ANTHROPIC_API_KEY) {
    console.log("Using Anthropic for job matching");
    return await matchWithAnthropic(resumeText, jobDescription);
  } 
  // If no AI services are available, throw an error
  else {
    throw new Error("No AI service API keys available for job matching");
  }
}

/**
 * Matches a resume with a job description using OpenAI's API
 */
async function matchWithOpenAI(resumeText: string, jobDescription: string): Promise<MatchResult> {
  // Define the prompt
  const systemPrompt = `You are an expert hiring manager. Given a user's resume and a job description, determine how well they match.
  
Return a percentage match (0-100%) and a list of 3-5 short, specific reasons explaining the match.

Return JSON ONLY in this exact shape:
{
  "matchScore": <0-100 number>,
  "reasons": [
    "<specific reason 1>",
    "<specific reason 2>",
    "<specific reason 3>"
  ]
}

Focus on specific, concrete skills and experience. Each reason should be 10 words or less.`;

  const userPrompt = `# RESUME:
${resumeText}

# JOB DESCRIPTION:
${jobDescription}`;

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
      temperature: 0.3, // Lower temperature for more consistent results
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  
  // Validate the result
  if (typeof result.matchScore !== 'number' || !Array.isArray(result.reasons)) {
    throw new Error("Invalid response format from OpenAI");
  }
  
  return {
    matchScore: Math.min(100, Math.max(0, Math.round(result.matchScore))), // Ensure score is 0-100
    reasons: result.reasons
  };
}

/**
 * Matches a resume with a job description using Anthropic's API
 */
async function matchWithAnthropic(resumeText: string, jobDescription: string): Promise<MatchResult> {
  // Define the prompt
  const prompt = `
<instructions>
You are an expert hiring manager. Given a user's resume and a job description, determine how well they match.

Return a percentage match (0-100%) and a list of 3-5 short, specific reasons explaining the match.

Return JSON ONLY in this exact shape:
{
  "matchScore": <0-100 number>,
  "reasons": [
    "<specific reason 1>",
    "<specific reason 2>",
    "<specific reason 3>"
  ]
}

Focus on specific, concrete skills and experience. Each reason should be 10 words or less.
</instructions>

# RESUME:
${resumeText}

# JOB DESCRIPTION:
${jobDescription}
`;

  // Make the API request to Anthropic
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    } as HeadersInit,
    body: JSON.stringify({
      model: "claude-3-sonnet-20240229",
      max_tokens: 1000,
      system: "You analyze resumes and job descriptions to determine match quality. Always respond with valid JSON.",
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
  
  // Extract JSON from potential text wrapper
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No valid JSON found in Anthropic response");
  }
  
  try {
    const result = JSON.parse(jsonMatch[0]);
    
    // Validate the result
    if (typeof result.matchScore !== 'number' || !Array.isArray(result.reasons)) {
      throw new Error("Invalid response format from Anthropic");
    }
    
    return {
      matchScore: Math.min(100, Math.max(0, Math.round(result.matchScore))), // Ensure score is 0-100
      reasons: result.reasons
    };
  } catch (error: any) {
    throw new Error(`Failed to parse Anthropic response: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Create a cache key for a resume-job pair
 * This helps avoid redundant API calls for the same content
 */
export function createMatchCacheKey(resumeText: string, jobDescription: string): string {
  // Simple hash function for caching
  let hash = 0;
  const str = resumeText.substring(0, 200) + jobDescription.substring(0, 200); // Use first 200 chars of each
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return 'match_' + Math.abs(hash).toString(16);
}