import fetch from 'node-fetch';

const WORKER_URL = process.env.VITE_PLAYWRIGHT_WORKER_URL || 'http://localhost:8080';
const TEST_URL = 'https://jobs.workable.com/view/2UEpA3xQoWK5zv8XyVdDvd/remote-fullstack-software-engineer-in-athens-at-blueground';

async function testWorker() {
  console.log('🧪 Testing Playwright Worker directly');
  console.log(`Worker URL: ${WORKER_URL}`);
  console.log(`Test Job URL: ${TEST_URL}`);
  console.log('');

  try {
    console.log('→ Sending request to /scrapeJobDescription...');
    const response = await fetch(`${WORKER_URL}/scrapeJobDescription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ url: TEST_URL })
    });

    console.log(`Response status: ${response.status}`);
    console.log(`Response headers:`, Object.fromEntries(response.headers));

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.log(`Error body: ${errorText}`);
      return;
    }

    const data = await response.json();
    console.log('✅ Response received:');
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
    console.log('Full error:', error);
  }
}

testWorker(); 