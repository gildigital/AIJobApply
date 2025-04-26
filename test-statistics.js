/**
 * This script can be run in the browser console to test the Workable application statistics endpoints
 */
async function testStatisticsEndpoint() {
  try {
    console.log('Fetching current application statistics...');
    const response = await fetch('/api/application-stats');
    const data = await response.json();
    
    console.log('Current statistics:', data);
    console.log('Success rate:', data.stats.successRate.toFixed(2) + '%');
    
    // Add mock data
    console.log('\nAdding mock data for testing...');
    const mockResponse = await fetch('/api/application-stats/mock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const mockData = await mockResponse.json();
    
    console.log('Statistics after adding mock data:', mockData);
    console.log('New success rate:', mockData.stats.successRate.toFixed(2) + '%');
    
    // Test a specific URL
    console.log('\nTesting a specific URL...');
    const testResponse = await fetch('/api/application-stats/test-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://test-company.workable.com/j/TEST12345',
        isSuccess: true,
        details: {
          fieldsCount: 12,
          testData: true
        }
      })
    });
    const testData = await testResponse.json();
    
    console.log('Statistics after testing specific URL:', testData);
    
    // Print pattern analysis
    if (testData.stats.patterns) {
      console.log('\n--- PATTERN ANALYSIS ---');
      
      console.log('\nDomain Success Rates:');
      for (const [domain, rate] of Object.entries(testData.stats.patterns.domainSuccessRates)) {
        console.log(`${domain}: ${rate.toFixed(2)}%`);
      }
      
      if (testData.stats.patterns.companyAnalysis?.length > 0) {
        console.log('\nTop Problematic Companies:');
        testData.stats.patterns.companyAnalysis.forEach(company => {
          console.log(`${company.company}: ${company.failureRate.toFixed(2)}% failure rate (${company.total} attempts)`);
        });
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error testing statistics endpoints:', error);
    return false;
  }
}

// Only execute this in a browser environment
if (typeof window !== 'undefined') {
  console.log('Run testStatisticsEndpoint() to test application statistics endpoints');
} else {
  console.log('This script is intended to be run in a browser environment');
}