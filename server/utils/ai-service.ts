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
  // console.log("AI scoring service available with:", 
  // hasOpenAIKey ? "OpenAI" : "", 
  // hasAnthropicKey ? (hasOpenAIKey ? " and Anthropic" : "Anthropic") : ""
  // );
}

/**
 * Simple usage tracking function that logs to console
 * In production, you could send this to analytics services like Mixpanel, Amplitude, etc.
 */
function logApiUsage(data: {
  userId: number;
  provider: string;
  model: string;
  operation: string;
  responseTimeMs: number;
  success: boolean;
  estimatedCostCents?: number;
  tokens?: { prompt: number; completion: number; total: number };
  error?: string;
  jobId?: number;
}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    ...data
  };
  
  // Log to console with structured format for easy parsing
  console.log(`[API_USAGE] ${JSON.stringify(logEntry)}`);
  
  // In production, you could also:
  // - Send to analytics service (Mixpanel, Amplitude, etc.)
  // - Write to a separate log file
  // - Send to monitoring service (DataDog, New Relic, etc.)
  // - Store in a time-series database
}

/**
 * Uses AI to match a resume with a job description and returns a match score and explanation
 * 
 * @param userId The user ID for tracking purposes
 * @param resumeText The parsed text of the user's resume
 * @param jobDescription The job description to match against
 * @param jobId Optional job ID for context
 * @returns Promise resolving to a match result with score and reasons
 */
export async function matchResumeToJob(
  userId: number,
  resumeText: string, 
  jobDescription: string,
  jobId?: number
): Promise<MatchResult> {
  const startTime = Date.now();
  
  // Try OpenAI first if key is available
  if (OPENAI_API_KEY) {
    try {
      // console.log("Using OpenAI for job matching");
      return await matchWithOpenAI(userId, resumeText, jobDescription, startTime, jobId);
    } catch (error) {
      console.error("Error with OpenAI matching:", error);

      // Log failed attempt
      logApiUsage({
        userId,
        provider: "openai",
        model: "gpt-4o-2024-08-06",
        operation: "job_matching",
        responseTimeMs: Date.now() - startTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        jobId
      });

      // If Anthropic is available, try it as fallback
      if (ANTHROPIC_API_KEY) {
        // console.log("Falling back to Anthropic for job matching");
        const fallbackStartTime = Date.now();
        return await matchWithAnthropic(userId, resumeText, jobDescription, fallbackStartTime, jobId);
      }

      // If no fallback, re-throw the error
      throw error;
    }
  }
  // If no OpenAI key but Anthropic is available, use Anthropic
  else if (ANTHROPIC_API_KEY) {
    // console.log("Using Anthropic for job matching");
    return await matchWithAnthropic(userId, resumeText, jobDescription, startTime, jobId);
  }
  // If no AI services are available, throw an error
  else {
    throw new Error("No AI service API keys available for job matching");
  }
}

/**
 * Matches a resume with a job description using OpenAI's API
 */
async function matchWithOpenAI(
  userId: number,
  resumeText: string,
  jobDescription: string,
  startTime: number,
  jobId?: number
): Promise<MatchResult> {
  const systemPrompt = `
You are an expert hiring manager. Given a user's resume and a job description,
determine how well they match.

Respond **only** with a JSON object matching this schema:

{
  "matchScore": <integer 0–100>,
  "reasons": [ "<short reason 1>", "<short reason 2>", "<short reason 3>" ]
}

Each reason must be 10 words or fewer.
`.trim();

  const userPrompt = `
# RESUME:
${resumeText}

# JOB DESCRIPTION:
${jobDescription}
`.trim();

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-2024-08-06", // ✅ Keep snapshot for stability
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "job_match_result",
          strict: true,
          schema: {
            type: "object",
            properties: {
              matchScore: { type: "integer", minimum: 0, maximum: 100 },
              reasons: {
                type: "array",
                items: { type: "string" },
                minItems: 3,
                maxItems: 5
              }
            },
            required: ["matchScore", "reasons"],
            additionalProperties: false
          }
        }
      }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  // Parse structured output (required as of current API behavior)
  const payload = await response.json();
  const contentString = payload.choices[0].message.content;

  let result: { matchScore: number; reasons: string[] };
  try {
    result = JSON.parse(contentString);
  } catch (e: any) {
    throw new Error(`Failed to parse structured output: ${e.message}`);
  }

  // Defensive validation
  if (typeof result.matchScore !== "number" || !Array.isArray(result.reasons)) {
    throw new Error("Invalid structured output format");
  }

  // Log successful API usage
  const tokens = {
    prompt: Math.ceil(userPrompt.length / 4), // Rough estimate: 4 chars per token
    completion: Math.ceil(contentString.length / 4),
    total: 0
  };
  tokens.total = tokens.prompt + tokens.completion;
  
  // Estimate cost (OpenAI GPT-4o pricing: $0.0025 per 1K prompt tokens, $0.01 per 1K completion tokens)
  const estimatedCostCents = Math.round(
    (tokens.prompt / 1000) * 0.25 + (tokens.completion / 1000) * 1.0
  );

  logApiUsage({
    userId,
    provider: "openai",
    model: "gpt-4o-2024-08-06",
    operation: "job_matching",
    responseTimeMs: Date.now() - startTime,
    success: true,
    estimatedCostCents,
    tokens,
    jobId
  });

  return {
    matchScore: Math.min(100, Math.max(0, Math.round(result.matchScore))),
    reasons: result.reasons
  };
}

/**
 * Matches a resume with a job description using Anthropic's API
 */
async function matchWithAnthropic(
  userId: number,
  resumeText: string,
  jobDescription: string,
  startTime: number,
  jobId?: number
): Promise<MatchResult> {
  const systemPrompt = [
    "You are an expert hiring manager. Respond ONLY with valid JSON.",
    "Format: {\"matchScore\": <0-100 integer>, \"reasons\": [\"reason1\", \"reason2\", \"reason3\"]}",
    "Each reason must be 10 words or fewer.",
    "Example: {\"matchScore\": 88, \"reasons\":[\"Strong TypeScript skills\",\"Deep React experience\",\"AWS cloud familiarity\"]}"
  ].join("\n");

  const userPrompt = `# RESUME:\n${resumeText}\n\n# JOB DESCRIPTION:\n${jobDescription}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01"
    } as HeadersInit,
    body: JSON.stringify({
      model: "claude-3-7-sonnet-20250219",
      temperature: 0,
      max_tokens: 100,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const { content } = await response.json();
  const raw = content?.[0]?.text;
  if (!raw) throw new Error("No response from Anthropic");

  // Robust JSON extraction (already implemented)
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No valid JSON found in response");

  let result: any;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch (e: any) {
    throw new Error(`Failed to parse JSON: ${e.message}`);
  }

  // Validation
  if (
    typeof result.matchScore !== "number" ||
    !Array.isArray(result.reasons)
  ) {
    throw new Error("Response JSON does not match schema");
  }

  // Log successful API usage
  const tokens = {
    prompt: Math.ceil(userPrompt.length / 4), // Rough estimate: 4 chars per token
    completion: Math.ceil(raw.length / 4),
    total: 0
  };
  tokens.total = tokens.prompt + tokens.completion;
  
  // Estimate cost (Anthropic Claude 3.5 Sonnet pricing: $0.003 per 1K prompt tokens, $0.015 per 1K completion tokens)
  const estimatedCostCents = Math.round(
    (tokens.prompt / 1000) * 0.3 + (tokens.completion / 1000) * 1.5
  );

  logApiUsage({
    userId,
    provider: "anthropic", 
    model: "claude-3-7-sonnet-20250219",
    operation: "job_matching",
    responseTimeMs: Date.now() - startTime,
    success: true,
    estimatedCostCents,
    tokens,
    jobId
  });

  return {
    matchScore: Math.min(100, Math.max(0, Math.round(result.matchScore))),
    reasons: result.reasons
  };
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