// Simple PDF text extraction utility
// In a production environment, we would use a proper PDF parsing library

/**
 * Extract text content from a PDF stored as base64 string
 * This is a simplified version that returns a dummy placeholder for testing
 * 
 * @param fileData Base64 encoded PDF file data
 * @returns Promise resolving to the extracted text content
 */
import { extractTextFromPDF } from './resume-parser.js';

/**
 * Extract text from a PDF stored as base64 string
 * @param fileData Base64 encoded PDF file
 * @returns Extracted text from the PDF
 */
async function extractTextFromPDFBase64(fileData: string): Promise<string> {
  try {
    console.log("[PDF Parser] Starting to decode base64 data...");
    // Decode base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');
    console.log("[PDF Parser] Successfully created buffer from base64, buffer size:", buffer.length);
    
    // Use the PDF parser to extract text
    const result = await extractTextFromPDF(buffer);
    console.log("[PDF Parser] Text extraction complete, result length:", result?.length || 0);
    
    // If no text was extracted or it's very short, it might be a corrupt PDF
    if (!result || result.length < 50) {
      console.warn("[PDF Parser] Warning: Extracted very little text. PDF might be corrupt or empty.");
      // For demo purposes, we'll return a dummy message instead of failing
      return "Warning: Could not extract meaningful text from the PDF. Please ensure it contains text content and is not just scanned images.";
    }
    
    return result;
  } catch (error) {
    console.error("[PDF Parser] Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF: " + (error instanceof Error ? error.message : String(error)));
  }
}

export { extractTextFromPDFBase64 };
export { extractTextFromPDF } from './resume-parser.js';