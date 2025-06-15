import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Search, AlertCircle, RefreshCw, StopCircle, Home, Globe, Building } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Label } from "@/components/ui/label";

interface JobListing {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  location: string;
  source: string;
  matchScore?: number;
  externalJobId?: string;
}

interface FindJobsResponse {
  success: boolean;
  jobs: JobListing[];
  message: string;
  hasMore?: boolean;
  continueToken?: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
    status: string;
  };
}

export default function FindJobsCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [jobsFound, setJobsFound] = useState<JobListing[]>([]);
  const [isSearchComplete, setIsSearchComplete] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 9, percentage: 0, status: "" });
  const [searchStartTime, setSearchStartTime] = useState<number | null>(null);
  const [searchTimeout, setSearchTimeout] = useState(false);
  const [continueToken, setContinueToken] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // Workplace preference state
  const [workplacePreference, setWorkplacePreference] = useState<'remote' | 'hybrid' | 'any'>('any');
  
  // Mutation to find jobs
  const findJobsMutation = useMutation<FindJobsResponse, Error, { continueToken?: string } | undefined>({
    mutationFn: async (options) => {
      // If loading more, don't reset the state
      if (!options?.continueToken) {
        // Reset for new search
        setSearchTimeout(false);
        setSearchStartTime(Date.now());
      }
      
      // Make the request with a timeout signal
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30-second hard timeout
      
      try {
        // Determine workplace parameter based on preference
        let remote: boolean | undefined = undefined;
        if (workplacePreference === 'remote') {
          remote = true;
        } else if (workplacePreference === 'hybrid') {
          remote = false;
        }
        // If 'any', we don't specify and let the server use defaults
        
        const response = await apiRequest("POST", "/api/auto-apply/find-jobs", {
          continueToken: options?.continueToken,
          pageSize: 20, // Increased page size for more comprehensive results
          maxInitialJobs: 50, // Increased from 15 to 50 for more comprehensive results
          workplace: workplacePreference !== 'any' ? workplacePreference : undefined,
          remote: remote // Send explicit remote preference when set
        });
        
        const data = await response.json();
        return data;
      } catch (error) {
        // If this is a timeout for pagination, just return what we have
        if ((error as any).name === 'AbortError' && options?.continueToken) {
          // console.log('Pagination request timed out, but we already have some results');
          return {
            success: true,
            jobs: [],
            hasMore: false,
            message: 'Timed out loading more results'
          };
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    onSuccess: (data) => {
      if (continueToken) {
        // Append jobs if loading more
        setJobsFound(prev => {
          const existingUrls = new Set(prev.map(job => job.applyUrl));
          const newJobs = data.jobs.filter(job => !existingUrls.has(job.applyUrl));
          return [...prev, ...newJobs];
        });
      } else {
        // Set new jobs if starting fresh
        setJobsFound(data.jobs || []);
      }
      
      // Update pagination state
      setContinueToken(data.continueToken);
      setHasMore(data.hasMore || false);
      
      // Complete the search process
      setIsSearchComplete(true);
      setSearchTimeout(false);
      setIsLoadingMore(false);
      
      toast({
        title: continueToken ? "More jobs loaded" : "Job search completed",
        description: data.message || `Found ${data.jobs.length} jobs matching your profile.`,
      });
    },
    onError: (error) => {
      setIsLoadingMore(false);
      
      // If timed out but we have some jobs, show them
      if (error.name === 'AbortError' && jobsFound.length > 0) {
        setIsSearchComplete(true);
        toast({
          title: "Partial Results",
          description: `Search timed out. Showing ${jobsFound.length} jobs found so far.`,
        });
      } else {
        toast({
          title: "Failed to find jobs",
          description: error.message || "An error occurred while searching for jobs.",
          variant: "destructive",
        });
      }
    },
  });
  
  // Poll for job search progress when a search is active
  const { data: progressData } = useQuery({
    queryKey: ['/api/auto-apply/search-progress'],
    queryFn: async () => {
      const response = await fetch('/api/auto-apply/search-progress');
      return response.json();
    },
    enabled: findJobsMutation.isPending && !searchTimeout,
    refetchInterval: 1500 // Poll every 1.5 seconds while search is active
  });
  
  // Update UI when new progress data arrives
  useEffect(() => {
    if (progressData?.progress) {
      setSearchProgress(progressData.progress);
      
      // If we have partial results, update them
      if (progressData.jobs && progressData.jobs.length > 0) {
        setJobsFound(prev => {
          // Add new jobs that aren't already in the list
          const existingUrls = new Set(prev.map(job => job.applyUrl));
          const newJobs = progressData.jobs.filter((job: JobListing) => !existingUrls.has(job.applyUrl));
          return [...prev, ...newJobs];
        });
      }
    }
  }, [progressData]);
  
  // Set a timeout to stop a long-running search after 25 seconds
  useEffect(() => {
    if (findJobsMutation.isPending && searchStartTime) {
      const timeoutId = setTimeout(() => {
        const searchDuration = Date.now() - searchStartTime;
        // If search has been running for more than 25 seconds, show what we have
        if (searchDuration > 25000 && !isSearchComplete) {
          setSearchTimeout(true);
          if (jobsFound.length > 0) {
            setIsSearchComplete(true);
            toast({
              title: "Partial results shown",
              description: `Search is taking longer than expected. Showing ${jobsFound.length} jobs found so far.`,
            });
          }
        }
      }, 25000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [findJobsMutation.isPending, searchStartTime, jobsFound.length, isSearchComplete]);
  
  // Mutation to enqueue jobs
  const enqueueJobsMutation = useMutation({
    mutationFn: async (jobIds: number[]) => {
      const response = await apiRequest("POST", "/api/job-queue/enqueue", { jobIds });
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Jobs added to queue",
        description: data.message || `Added ${data.queuedJobs?.length || 0} jobs to the application queue.`,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["/api/job-queue/status"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add jobs to queue",
        description: error.message || "An error occurred while adding jobs to the queue.",
        variant: "destructive",
      });
    },
  });
  
  // Handle find jobs button click
  const handleFindJobs = () => {
    setContinueToken(undefined);
    setHasMore(false);
    setIsSearchComplete(false);
    setJobsFound([]);
    findJobsMutation.mutate(undefined);
  };
  
  // Handle loading more jobs
  const handleLoadMore = () => {
    if (!continueToken || isLoadingMore) return;
    
    // Store current token in a local variable because state updates are async
    const currentToken = continueToken;
    
    // console.log("Loading more jobs with token:", currentToken);
    setIsLoadingMore(true);
    findJobsMutation.mutate({ continueToken: currentToken });
  };
  
  // Handle canceling the search
  const handleCancelSearch = () => {
    // If we have found some jobs, show those
    if (jobsFound.length > 0) {
      setIsSearchComplete(true);
      toast({
        title: "Search stopped",
        description: `Showing ${jobsFound.length} jobs found so far.`,
      });
    } else {
      // Reset the search state
      setIsSearchComplete(false);
      findJobsMutation.reset();
    }
    setSearchTimeout(true);
  };

  // Calculate search duration
  const getSearchDuration = () => {
    if (!searchStartTime) return "";
    const seconds = Math.floor((Date.now() - searchStartTime) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Jobs</CardTitle>
        <CardDescription>Search for real job opportunities based on your profile</CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {findJobsMutation.isPending && !searchTimeout ? (
          <div className="flex flex-col items-center justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm text-muted-foreground mb-4">
              Searching for matching jobs... ({getSearchDuration()})
            </p>
            
            {/* Progress indicator */}
            <div className="w-full space-y-2">
              <Progress value={searchProgress.percentage} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {searchProgress.status || `Searching page ${searchProgress.current} of ${searchProgress.total}`}
              </p>
            </div>
            
            {/* Show jobs as they're found */}
            {jobsFound.length > 0 && (
              <div className="w-full mt-4">
                <p className="text-sm mb-2">Found {jobsFound.length} jobs so far:</p>
                <ScrollArea className="h-[200px] pr-3">
                  <div className="space-y-3">
                    {jobsFound.map((job, index) => (
                      <div key={index} className="border rounded-md p-3 text-sm">
                        <h4 className="font-medium">{job.jobTitle}</h4>
                        <div className="text-muted-foreground mt-1">{job.company}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
            
            {/* Cancel button */}
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={handleCancelSearch}
            >
              <StopCircle className="h-4 w-4 mr-2" />
              {jobsFound.length > 0 ? "Show Results" : "Cancel Search"}
            </Button>
          </div>
        ) : findJobsMutation.isError && !searchTimeout ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {findJobsMutation.error.message || "Failed to search for jobs."}
            </AlertDescription>
          </Alert>
        ) : isSearchComplete && jobsFound.length === 0 ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No jobs found</AlertTitle>
            <AlertDescription>
              We couldn't find any jobs matching your profile. Try updating your preferences and search again.
            </AlertDescription>
          </Alert>
        ) : isSearchComplete && jobsFound.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm">Found {jobsFound.length} jobs matching your profile:</p>
            
            <ScrollArea className="h-[300px] pr-3">
              <div className="space-y-3">
                {jobsFound.map((job, index) => (
                  <div key={index} className="border rounded-md p-3 text-sm">
                    <div className="flex justify-between items-start">
                      <h4 className="font-medium">{job.jobTitle}</h4>
                      {job.matchScore && (
                        <Badge variant={job.matchScore >= 70 ? "outline" : "secondary"} className="ml-2">
                          {job.matchScore}% match
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1">{job.company} • {job.location}</div>
                    <p className="mt-2 line-clamp-2">{job.description}</p>
                    <div className="flex justify-between items-center mt-3">
                      <Button variant="outline" size="sm" asChild>
                        <a href={job.applyUrl} target="_blank" rel="noopener noreferrer">
                          View Job
                        </a>
                      </Button>
                      <Badge variant="secondary">{job.source}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            {/* Load more button */}
            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading more...
                    </>
                  ) : (
                    <>
                      Load more jobs
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center space-y-6">
            <div>
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                Click the button below to search for jobs matching your profile preferences.
              </p>
            </div>
            
            {/* Search preferences controls */}
            <div className="w-full max-w-sm mx-auto space-y-4">
              {/* Workplace Type preference */}
              <div>
                <Label htmlFor="workplace-preference" className="block text-sm font-medium mb-2">
                  Workplace Type
                </Label>
                <ToggleGroup 
                  type="single" 
                  value={workplacePreference}
                  onValueChange={(value) => value && setWorkplacePreference(value as 'remote' | 'hybrid' | 'any')}
                  className="justify-start w-full"
                >
                  <ToggleGroupItem value="remote" aria-label="Remote jobs only">
                    <Home className="h-4 w-4 mr-1" />
                    Remote
                  </ToggleGroupItem>
                  <ToggleGroupItem value="hybrid" aria-label="Hybrid jobs only">
                    <Building className="h-4 w-4 mr-1" />
                    Hybrid
                  </ToggleGroupItem>
                  <ToggleGroupItem value="any" aria-label="Any workplace type">
                    <Globe className="h-4 w-4 mr-1" />
                    Any
                  </ToggleGroupItem>
                </ToggleGroup>
                <p className="text-xs text-muted-foreground mt-1">
                  {workplacePreference === 'remote' 
                    ? 'Showing only remote positions' 
                    : workplacePreference === 'hybrid' 
                      ? 'Showing hybrid and on-site positions' 
                      : 'Showing all workplace types'}
                </p>
              </div>
              

            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter>
        <Button 
          onClick={handleFindJobs}
          disabled={findJobsMutation.isPending && !searchTimeout}
          className="w-full"
        >
          {findJobsMutation.isPending && !searchTimeout ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Searching...
            </>
          ) : isSearchComplete ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Search Again
            </>
          ) : (
            <>
              <Search className="mr-2 h-4 w-4" />
              Find Matching Jobs
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}