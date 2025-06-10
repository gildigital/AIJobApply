/**
 * Test script for job description scraping
 * This tests the new scrapeJobDescription endpoint in playwright-worker
 */

const PLAYWRIGHT_WORKER_URL = process.env.VITE_PLAYWRIGHT_WORKER_URL || 'http://localhost:8080';
const TEST_JOBS = [
  'https://jobs.workable.com/view/2UEpA3xQoWK5zv8XyVdDvd/remote-fullstack-software-engineer-in-athens-at-blueground',
  'https://jobs.workable.com/view/cBBJ5RhGsr7YZuP81s8n5P/remote-lead-frontend-engineer-(6%2B-yrs---early-stage-startup)-in-bengaluru-at-simbian',
  'https://jobs.workable.com/view/kktdtFSuBtBtRtP7MbHeh1/remote-frontend-developer-in-serbia-at-billingplatform'
];

async function testJobDescriptionScraping() {
  console.log('🧪 Testing Job Description Scraping');
  console.log(`Using Playwright Worker at: ${PLAYWRIGHT_WORKER_URL}`);
  console.log('');

  for (let i = 0; i < TEST_JOBS.length; i++) {
    const jobUrl = TEST_JOBS[i];
    console.log(`📝 Test ${i + 1}/${TEST_JOBS.length}: ${jobUrl}`);
    
    try {
      console.log('  → Calling scrapeJobDescription endpoint...');
      const response = await fetch(`${PLAYWRIGHT_WORKER_URL}/scrapeJobDescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: jobUrl })
      });

      if (!response.ok) {
        console.log(`  ❌ HTTP Error: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      
      if (data.success) {
        console.log(`  ✅ Success!`);
        console.log(`     Title: "${data.title}"`);
        console.log(`     Company: "${data.company}"`);
        console.log(`     Location: "${data.location}" ${data.isRemote ? '(Remote)' : ''}`);
        console.log(`     Description: ${data.description.length} characters`);
        
        // Validate extraction quality
        if (data.title && !data.title.includes('|') && !data.title.includes('Jobs By Workable')) {
          console.log(`     ✅ Job title extracted cleanly`);
        } else {
          console.log(`     ⚠️  Job title may need cleaning: "${data.title}"`);
        }
        
        if (data.company && !data.company.includes('|') && !data.company.includes('Jobs By Workable')) {
          console.log(`     ✅ Company name extracted cleanly`);
        } else {
          console.log(`     ⚠️  Company name may need cleaning: "${data.company}"`);
        }
        
        if (data.description.length > 100) {
          console.log(`     Preview: ${data.description.substring(0, 100)}...`);
        } else {
          console.log(`     Full Description: ${data.description}`);
        }
      } else {
        console.log(`  ❌ Scraping failed: ${data.error}`);
      }
      
    } catch (error) {
      console.log(`  ❌ Request failed: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🏁 Job description scraping test completed');
}

async function testAIJobApplyIntegration() {
  console.log('🤖 Testing AIJobApply Integration');
  console.log('Testing the /api/workable/direct-fetch endpoint...');
  console.log('');

  const AIJobApplyURL = process.env.VITE_BACKEND_URL || 'http://localhost:5000';
  
  for (let i = 0; i < TEST_JOBS.length; i++) {
    const jobUrl = TEST_JOBS[i];
    console.log(`📋 Test ${i + 1}/${TEST_JOBS.length}: ${jobUrl}`);
    
    try {
      console.log('  → Calling AIJobApply direct-fetch endpoint...');
      const response = await fetch(`${AIJobApplyURL}/api/workable/direct-fetch?url=${encodeURIComponent(jobUrl)}`);

      if (!response.ok) {
        console.log(`  ❌ HTTP Error: ${response.status} ${response.statusText}`);
        continue;
      }

      const data = await response.json();
      
      if (data.success && data.job) {
        console.log(`  ✅ Success!`);
        console.log(`     Title: ${data.job.title}`);
        console.log(`     Company: ${data.job.company}`);
        console.log(`     Location: ${data.job.location}`);
        console.log(`     Description: ${data.job.description.length} characters`);
        
        if (data.job.description !== "No description available") {
          console.log(`     ✅ Job description extracted successfully!`);
          if (data.job.description.length > 100) {
            console.log(`     Preview: ${data.job.description.substring(0, 100)}...`);
          }
        } else {
          console.log(`     ⚠️  No job description extracted`);
        }
      } else {
        console.log(`  ❌ Failed: ${data.error || 'Unknown error'}`);
      }
      
    } catch (error) {
      console.log(`  ❌ Request failed: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('🎯 AIJobApply integration test completed');
}

// Run the tests
async function main() {
  console.log('🚀 Starting Job Description Scraping Tests\n');
  
  // Test 1: Direct playwright-worker endpoint
  await testJobDescriptionScraping();
  
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Test 2: AIJobApply integration
  await testAIJobApplyIntegration();
  
  console.log('\n✨ All tests completed!');
}

main().catch(error => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
}); 