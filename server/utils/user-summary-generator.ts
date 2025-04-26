/**
 * User summary generator
 * Generates a concise summary from resume text
 */
import { generateResumeSummary } from './resume-parser';
import { OpenAI } from 'openai';

// Check if OpenAI API key is available
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

/**
 * Generate a user summary from resume text
 * Uses OpenAI if available, falls back to regex-based extraction
 */
export async function generateUserSummary(resumeText: string): Promise<string> {
  // If no resume text, return empty
  if (!resumeText || resumeText.trim().length === 0) {
    return "";
  }
  
  try {
    // First try OpenAI if available
    if (openai) {
      try {
        return await generateSummaryWithOpenAI(resumeText);
      } catch (error) {
        console.error("OpenAI summary generation failed:", error);
        // Fall back to text-based extraction
      }
    }
    
    // Use basic text-based extraction as backup
    return generateResumeSummary(resumeText);
  } catch (error) {
    console.error("Error generating user summary:", error);
    throw new Error("Failed to generate user summary");
  }
}

/**
 * Generate user summary with OpenAI
 */
async function generateSummaryWithOpenAI(resumeText: string): Promise<string> {
  if (!openai) throw new Error("OpenAI API key not available");
  
  const prompt = `
I need a concise professional summary (max 50 words) based on this resume text. 
Focus on key skills, experience, and career highlights.
Format as a single paragraph with no introductory phrases like "This person is" or "The candidate".

Resume text:
${resumeText.substring(0, 2000)}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
    messages: [
      { role: "system", content: "You are a professional resume writer who creates concise, accurate summaries." },
      { role: "user", content: prompt }
    ],
    max_tokens: 150,
    temperature: 0.7,
  });

  return completion.choices[0].message.content?.trim() || "";
}