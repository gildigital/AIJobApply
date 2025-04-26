/**
 * Resume parsing utility to extract text and information from PDF resumes
 */
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';

/**
 * Extract text from a PDF file buffer
 * @param pdfBuffer The PDF file buffer
 * @returns The extracted text
 */
export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    console.log('[Resume Parser] Attempting to parse PDF with buffer size:', pdfBuffer.length);
    const data = await pdfParse(pdfBuffer);
    console.log('[Resume Parser] PDF parse successful:', {
      pageCount: data.numpages || 'unknown',
      version: data.version || 'unknown',
      textLength: data.text?.length || 0
    });
    return data.text || '';
  } catch (error) {
    console.error('[Resume Parser] Error parsing PDF:', error);
    throw new Error('Failed to parse PDF file: ' + (error instanceof Error ? error.message : String(error)));
  }
}

/**
 * Generate a summary of the resume content using AI
 * This would be enhanced with OpenAI/Anthropic, but for now we'll do basic extraction
 * @param resumeText The full text from the resume
 * @returns A concise summary of the resume
 */
export function generateResumeSummary(resumeText: string): string {
  // Extract the first 500 characters as a basic summary
  // This will be replaced with an AI-powered summary in production
  // For now, trying to extract key information from the text
  
  if (!resumeText) {
    return "No resume text available";
  }
  
  const lines = resumeText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Try to extract key sections
  const summary = [];
  
  // Try to find name (usually at the top)
  if (lines.length > 0) {
    summary.push(lines[0]);
  }
  
  // Look for skills section
  const skillsIndex = findSectionIndex(lines, ['SKILLS', 'TECHNICAL SKILLS', 'CORE COMPETENCIES']);
  if (skillsIndex >= 0 && skillsIndex < lines.length - 1) {
    const skillsText = extractSection(lines, skillsIndex);
    if (skillsText) {
      summary.push(skillsText);
    }
  }
  
  // Look for experience 
  const experienceIndex = findSectionIndex(lines, ['EXPERIENCE', 'WORK EXPERIENCE', 'PROFESSIONAL EXPERIENCE']);
  if (experienceIndex >= 0 && experienceIndex < lines.length - 1) {
    // Just take the first position/role
    const experienceText = extractSection(lines, experienceIndex, 5); // Limit to 5 lines
    if (experienceText) {
      summary.push(experienceText);
    }
  }
  
  // Look for education
  const educationIndex = findSectionIndex(lines, ['EDUCATION', 'ACADEMIC BACKGROUND']);
  if (educationIndex >= 0 && educationIndex < lines.length - 1) {
    const educationText = extractSection(lines, educationIndex, 3); 
    if (educationText) {
      summary.push(educationText);
    }
  }
  
  if (summary.length === 0) {
    // Fallback: just take the first 3-5 lines
    return lines.slice(0, Math.min(5, lines.length)).join(' ');
  }
  
  return summary.join(' ');
}

/**
 * Find the index of a section heading in the resume text
 */
function findSectionIndex(lines: string[], possibleHeadings: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].toUpperCase();
    if (possibleHeadings.some(heading => line.includes(heading))) {
      return i;
    }
  }
  return -1;
}

/**
 * Extract text from a section of the resume
 */
function extractSection(lines: string[], startIndex: number, maxLines = 10): string {
  const sectionLines = [];
  let currentIndex = startIndex + 1;
  
  // Skip the heading and get content
  while (
    currentIndex < lines.length &&
    sectionLines.length < maxLines &&
    !isSectionHeading(lines[currentIndex])
  ) {
    sectionLines.push(lines[currentIndex]);
    currentIndex++;
  }
  
  return sectionLines.join(' ');
}

/**
 * Check if a line is likely a section heading
 */
function isSectionHeading(line: string): boolean {
  // Most section headings are short, all caps, and/or end with a colon
  const upperLine = line.toUpperCase();
  
  // Common section headings
  const headings = [
    'EDUCATION', 'EXPERIENCE', 'SKILLS', 'SUMMARY', 'OBJECTIVE', 
    'PROFILE', 'WORK HISTORY', 'PROJECTS', 'AWARDS', 'REFERENCES',
    'CERTIFICATIONS', 'PUBLICATIONS', 'LANGUAGES', 'INTERESTS'
  ];
  
  return line.length < 30 && 
    (upperLine === line || line.endsWith(':') || 
     headings.some(heading => upperLine.includes(heading)));
}