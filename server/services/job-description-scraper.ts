import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

/**
 * Fetches and extracts the job description from a job posting URL.
 * Currently supports Workable job pages. Extend as needed for other sources.
 * @param jobUrl The URL of the job posting
 * @returns The extracted job description as plain text
 */
export async function fetchJobDescription(jobUrl: string): Promise<string> {
  try {
    const response = await fetch(jobUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AIJobApplyBot/1.0)'
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch job page: ${response.status}`);
    }
    const html = await response.text();
    const $ = cheerio.load(html);

    // Workable job description is usually in a div with class 'section--text' or similar
    let description = $('.section--text').text().trim();
    if (!description) {
      // Fallback: try common selectors
      description = $('[data-qa="job-description"], .job-description, .description, main').text().trim();
    }
    // Fallback: get all <p> tags inside main content
    if (!description) {
      description = $('main p').map((_, el) => $(el).text()).get().join('\n').trim();
    }
    return description || '';
  } catch (error) {
    console.error('Error fetching job description:', error);
    return '';
  }
}
