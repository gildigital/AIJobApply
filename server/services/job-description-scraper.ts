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

    // Try the most specific selector first (Workable's main job description)
    let description = $('[data-ui="job-breakdown-description-parsed-html"]').text().trim();

    // If missing, try to concatenate requirements and benefits for more context
    if (!description) {
      const requirements = $('[data-ui="job-breakdown-requirements-parsed-html"]').text().trim();
      const benefits = $('[data-ui="job-breakdown-benefits-parsed-html"]').text().trim();
      description = [description, requirements, benefits].filter(Boolean).join('\n\n');
    }

    // Fallback: try old selectors
    if (!description) {
      description = $('.section--text').text().trim();
    }
    if (!description) {
      description = $('[data-qa="job-description"], .job-description, .description, main').text().trim();
    }
    if (!description) {
      description = $('main p').map((_, el) => $(el).text()).get().join('\n').trim();
    }
    return description || '';
  } catch (error) {
    console.error('Error fetching job description:', error);
    return '';
  }
}
