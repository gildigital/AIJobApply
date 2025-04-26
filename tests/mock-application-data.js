// Helper script to mock some test data for the application statistics endpoint
import { workableScraper } from '../server/services/workable-scraper.js';

// Mock some successful URLs
const successfulUrls = [
  'https://jobs.workable.com/view/cE5twwuacatfKqKxhCVVMg',
  'https://jobs.workable.com/view/A02njs98KdTcXq119tRZQX',
  'https://example-company.workable.com/j/BC2937DDAS',
  'https://apply.workable.com/example-tech/j/F8293A121'
];

// Mock some problematic URLs
const problematicUrls = [
  'https://jobs.workable.com/view/jVFTnvZ6eGzLP654dSFSs1',
  'https://jobs.workable.com/view/PQ8a7hU3TvRsLoE29jXpFg',
  'https://another-company.workable.com/j/AA938272D',
  'https://apply.workable.com/big-corp/j/9938AJSD22',
  'https://jobs.workable.com/view/9I37Dh6aFgD82lJsVzZaQx'
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
function mockApplicationData() {
  console.log('Adding mock application data...');
  
  // Mock successful data
  successfulUrls.forEach((url, index) => {
    const fieldsCount = 5 + Math.floor(Math.random() * 10); // Random number of fields between 5-15
    workableScraper.logSuccessfulUrl(url, fieldsCount, { 
      testEntry: true,
      mockIndex: index
    });
    console.log(`Added successful URL: ${url} with ${fieldsCount} fields`);
  });
  
  // Mock problem data
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
  
  // Get and display statistics
  const stats = workableScraper.getApplicationStatistics();
  console.log('Application Statistics:');
  console.log(JSON.stringify(stats, null, 2));
}

// Execute the function
mockApplicationData();