/**
 * This file contains test functions that can be used to simulate job application
 * success and failure data to help diagnose why 95% of Workable applications fail.
 */
import { workableScraper } from '../services/workable-scraper.js';

// Mock successful job application URLs
const successfulUrls = [
  'https://jobs.workable.com/view/cE5twwuacatfKqKxhCVVMg',
  'https://jobs.workable.com/view/A02njs98KdTcXq119tRZQX',
  'https://example-company.workable.com/j/BC2937DDAS',
  'https://apply.workable.com/example-tech/j/F8293A121'
];

// Mock problematic job application URLs
const problematicUrls = [
  'https://jobs.workable.com/view/jVFTnvZ6eGzLP654dSFSs1',
  'https://jobs.workable.com/view/PQ8a7hU3TvRsLoE29jXpFg',
  'https://another-company.workable.com/j/AA938272D',
  'https://apply.workable.com/big-corp/j/9938AJSD22',
  'https://jobs.workable.com/view/9I37Dh6aFgD82lJsVzZaQx',
  'https://apply.workable.com/startup-inc/j/7ASD6F5G4H',
  'https://enterprise.workable.com/j/K12L34M56N',
  'https://jobs.workable.com/view/O78P90Q12R'
];

// Different error types to mock
const errorTypes = [
  'introspection_error',
  'introspection_exception',
  'form_submission_error',
  'unexpected_redirect',
  'timeout_error'
];

// Add mock data to the workableScraper
export function mockApplicationData() {
  console.log('Adding mock application data for diagnosis...');
  
  // Mock successful data
  successfulUrls.forEach((url, index) => {
    const fieldsCount = 5 + Math.floor(Math.random() * 10); // Random number of fields between 5-15
    workableScraper.logSuccessfulUrl(url, fieldsCount, { 
      testEntry: true,
      mockIndex: index
    });
    console.log(`Added successful URL: ${url} with ${fieldsCount} fields`);
  });
  
  // Mock problem data - with more problematic URLs for analysis patterns
  problematicUrls.forEach((url, index) => {
    const errorType = errorTypes[index % errorTypes.length];
    const errorDetails = {
      status: 500,
      error: `Mock ${errorType} for testing purposes`,
      testEntry: true,
      mockIndex: index
    };
    
    workableScraper.logProblemUrl(url, errorType, errorDetails);
    console.log(`Added problematic URL: ${url} with error type: ${errorType}`);
  });
  
  console.log('Mock data added successfully');
  return workableScraper.getApplicationStatistics();
}

// Function to add direct test data for a specific URL
export function testSpecificUrl(url: string, isSuccess: boolean, details: any = {}) {
  if (isSuccess) {
    const fieldsCount = details.fieldsCount || 8;
    workableScraper.logSuccessfulUrl(url, fieldsCount, details);
    console.log(`Added successful test URL: ${url} with ${fieldsCount} fields`);
  } else {
    const errorType = details.errorType || 'introspection_error';
    workableScraper.logProblemUrl(url, errorType, details);
    console.log(`Added problematic test URL: ${url} with error type: ${errorType}`);
  }
  
  // Return current statistics
  return workableScraper.getApplicationStatistics();
}