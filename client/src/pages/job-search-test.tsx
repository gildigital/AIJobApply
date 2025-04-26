import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ExternalLink, Award } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Job listing type from API
interface JobListing {
  jobTitle: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  postedAt?: string;
  source: string;
  externalJobId: string;
}

export default function JobSearchTest() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [keywords, setKeywords] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [searchPerformed, setSearchPerformed] = useState<boolean>(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSearchPerformed(true);

    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (keywords) params.append("keywords", keywords);
      if (location) params.append("location", location);

      // Make the request to our API
      const response = await apiRequest("GET", `/api/jobs/search?${params.toString()}`);
      const data = await response.json();
      
      setJobs(data.jobs || []);
      
      toast({
        title: "Search complete",
        description: `Found ${data.count} jobs matching your criteria`,
      });
    } catch (error) {
      console.error("Error searching for jobs:", error);
      toast({
        title: "Error searching for jobs",
        description: "Please try again later",
        variant: "destructive",
      });
      setJobs([]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Job Search API Test</h1>
          <p className="text-gray-500 mt-2">
            This page tests the integration with the Adzuna job search API. Enter keywords and location to search for jobs.
          </p>
        </div>
        <Link to="/job-match-test" className="flex items-center gap-2 text-primary hover:text-primary/80">
          <Award className="h-4 w-4" />
          <span>Try AI Job Match Test</span>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search Parameters</CardTitle>
          <CardDescription>Enter keywords and location to find matching jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label htmlFor="keywords" className="block text-sm font-medium mb-1">
                Keywords (comma separated)
              </label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g. javascript, react, developer"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="location" className="block text-sm font-medium mb-1">
                Location
              </label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. New York, Remote"
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                "Search Jobs"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {searchPerformed && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Search Results</h2>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : jobs.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {jobs.map((job) => (
                <Card key={job.externalJobId} className="h-full flex flex-col">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{job.jobTitle}</CardTitle>
                        <CardDescription>{job.company}</CardDescription>
                      </div>
                      <Badge>{job.source}</Badge>
                    </div>
                    <div className="text-sm text-gray-500">{job.location}</div>
                    {job.postedAt && (
                      <div className="text-xs text-gray-400">
                        Posted: {new Date(job.postedAt).toLocaleDateString()}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="flex-grow">
                    <p className="text-sm line-clamp-4">{job.description}</p>
                  </CardContent>
                  <CardFooter>
                    <a
                      href={job.applyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-primary hover:text-primary/80 text-sm"
                    >
                      Apply <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                  </CardFooter>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center p-8 border rounded-lg bg-gray-50">
              <p className="text-gray-500">No jobs found matching your search criteria.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}