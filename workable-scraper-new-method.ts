  async scrapeJobsFromSearchUrl(
    searchUrl: string,
    state?: SearchState,
    jobDetailTimeoutMs: number = 10000
  ): Promise<JobListing[]> {
    try {
      const urlObj = new URL(searchUrl);
      const query = urlObj.searchParams.get('query') || '';
      console.log(`Fetching job listings from: ${searchUrl}`);

      // Use Playwright worker to scroll and extract job links
      const workerUrl = process.env.VITE_PLAYWRIGHT_WORKER_URL;
      if (!workerUrl) {
        console.error('No Playwright worker URL configured');
        return [];
      }
      const completeWorkerUrl = workerUrl.startsWith('http') ? workerUrl : `https://${workerUrl}`;
      const payload = {
        url: searchUrl,
        scroll: true,
        maxScrolls: 50,
      };
      const response = await this.limiter.schedule(() =>
        fetch(`${completeWorkerUrl}/scrape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      );

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '10', 10);
          console.warn(`Rate limited (429) when fetching ${searchUrl}. Queuing for retry after ${retryAfter}s`);
          this.logProblemUrl(searchUrl, 'rate_limited_429', { timestamp: new Date().toISOString(), retryAfter });
          if (state) {
            const rateLimitKey = `rate_limit_${query}`;
            const attempts = (state[rateLimitKey] || 0) + 1;
            state[rateLimitKey] = attempts;
            const backoffPriority = Math.max(0.05, 0.5 / Math.pow(2, attempts));
            setTimeout(() => {
              state.searchUrls.push({ url: searchUrl, priority: backoffPriority });
              console.log(`Re-queued rate-limited URL with priority ${backoffPriority.toFixed(3)} (attempt ${attempts})`);
            }, retryAfter * 1000);
          }
          return [];
        }
        console.error(`Failed to fetch: ${response.statusText}, Status: ${response.status}`);
        return [];
      }

      const data = await response.json();
      const jobLinks: string[] = data.jobLinks || [];
      const totalJobsOnPage = jobLinks.length;
      console.log(`Found ${totalJobsOnPage} unique job links for query "${query}" via infinite scrolling`);

      let newLinks = state
        ? jobLinks.filter(link => {
            const potentialId = link.split('/').pop();
            return potentialId && !state.jobIds.has(potentialId);
          })
        : jobLinks;
      const newJobsFound = newLinks.length;
      const duplicateJobsFound = totalJobsOnPage - newJobsFound;

      const MAX_JOBS_PER_PAGE = 20;
      const jobsToProcess = newLinks.slice(0, MAX_JOBS_PER_PAGE);

      const detailFetchPromises = jobsToProcess.map(jobLink =>
        this.limiter.schedule(() =>
          this.fetchJobDetailsWithTimeout(jobLink, jobDetailTimeoutMs).then(detail => ({ link: jobLink, detail }))
        )
      );
      const results = await Promise.allSettled(detailFetchPromises);

      const jobListings: JobListing[] = [];
      let successfulDetailsCount = 0;

      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.detail) {
          const { link, detail } = result.value;
          successfulDetailsCount++;
          if (state) {
            const potentialId = link.split('/').pop();
            if (potentialId) state.jobIds.add(potentialId);
          }
          const matchScore = this.calculateInitialMatchScore({
            title: detail.title,
            company: detail.company,
            description: detail.description,
            location: detail.location,
          });
          jobListings.push({
            jobTitle: detail.title,
            company: detail.company,
            description: detail.description,
            applyUrl: link,
            location: detail.location,
            source: 'workable',
            matchScore,
            externalJobId: link.split('/').pop(),
          });
        }
      });

      console.log(`Successfully fetched ${successfulDetailsCount}/${jobsToProcess.length} job details from ${searchUrl}`);
      console.log(`Found ${jobListings.length} jobs from ${searchUrl}, added ${jobListings.length} to results`);

      if (state) {
        state.processedUrls.push(searchUrl);
        state.totalJobsFound += jobListings.length;

        const effectivenessScore = totalJobsOnPage > 0 ? newJobsFound / totalJobsOnPage : 0;
        const avgMatchScore = jobListings.length > 0
          ? jobListings.reduce((sum, job) => sum + (job.matchScore || 70), 0) / jobListings.length
          : 70;
        const queryEffectivenessKey = `effectiveness_${query}`;
        const previousEffectiveness = state[queryEffectivenessKey] || 0;
        const alpha = 0.3;
        state[queryEffectivenessKey] = previousEffectiveness * (1 - alpha) + effectivenessScore * alpha;

        if (jobListings.length === 0) {
          console.log(`No new jobs for query "${query}". Stopping scroll.`);
        }
      }

      return jobListings;
    } catch (error) {
      console.error(`Error scraping ${searchUrl}:`, error);
      if (state) {
        const errorKey = `error_count_${searchUrl}`;
        const errorCount = (state[errorKey] || 0) + 1;
        state[errorKey] = errorCount;
        if (errorCount <= 3) {
          const backoffDelay = Math.pow(2, errorCount) * 1000;
          const retryPriority = Math.max(0.05, 0.3 / errorCount);
          setTimeout(() => {
            state.searchUrls.push({ url: searchUrl, priority: retryPriority });
            console.log(`Re-queued failed URL with priority ${retryPriority.toFixed(2)} after ${backoffDelay}ms (attempt ${errorCount})`);
          }, backoffDelay);
        } else {
          state.processedUrls.push(searchUrl);
          console.log(`URL failed ${errorCount} times, not retrying: ${searchUrl}`);
        }
      }
      return [];
    }
  }