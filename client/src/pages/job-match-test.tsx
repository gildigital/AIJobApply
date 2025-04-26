import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, AlertCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// Interface for job details to match
interface JobDetails {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl?: string;
  location?: string;
}

// Interface for match result from API
interface MatchResult {
  job: JobDetails;
  matchScore: number;
  matchReasons: string[];
  success: boolean;
  message?: string;
}

export default function JobMatchTest() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Job details form state
  const [jobDetails, setJobDetails] = useState<JobDetails>({
    jobTitle: "",
    company: "",
    description: "",
    applyUrl: "",
    location: ""
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setJobDetails({
      ...jobDetails,
      [e.target.name]: e.target.value
    });
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      // Validate form data
      if (!jobDetails.jobTitle || !jobDetails.company || !jobDetails.description) {
        toast({
          title: "Missing information",
          description: "Please provide job title, company, and description.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      
      // Call the API with job details
      const response = await apiRequest("POST", "/api/jobs/match", jobDetails);
      const data = await response.json();
      
      // Update state with match results
      setMatchResult(data);
      
      // Show success message
      toast({
        title: "Match analysis complete",
        description: `Match score: ${data.matchScore}%`,
      });
    } catch (error) {
      console.error("Error getting job match:", error);
      toast({
        title: "Error analyzing job match",
        description: "Please try again later or check your resume is uploaded.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get the appropriate badge variant based on match score
  const getMatchBadgeVariant = (score: number): "default" | "destructive" | "secondary" | "outline" | "success" => {
    if (score >= 80) return "success"; // Use success (green) for excellent scores
    if (score >= 60) return "default"; // Use default (blue) for good scores
    if (score >= 40) return "secondary"; // Use secondary for fair scores
    return "destructive"; // Use destructive for poor scores
  };

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">AI Job Match Analysis</h1>
          <p className="text-gray-500 mt-2">
            This tool tests the AI-powered job matching system, which analyzes how well your resume matches a job description.
            Enter job details below to get your match score and personalized feedback.
          </p>
        </div>
        <Link to="/job-search-test" className="flex items-center gap-2 text-primary hover:text-primary/80">
          <Search className="h-4 w-4" />
          <span>Try Job Search API Test</span>
        </Link>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Job details form card */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Job Details</CardTitle>
            <CardDescription>
              Enter the job details to analyze your match score
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobTitle">Job Title*</Label>
                <Input
                  id="jobTitle"
                  name="jobTitle"
                  placeholder="Software Engineer"
                  value={jobDetails.jobTitle}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="company">Company*</Label>
                <Input
                  id="company"
                  name="company"
                  placeholder="TechCorp Inc."
                  value={jobDetails.company}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  name="location"
                  placeholder="San Francisco, CA"
                  value={jobDetails.location}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="applyUrl">Application URL</Label>
                <Input
                  id="applyUrl"
                  name="applyUrl"
                  placeholder="https://company.com/careers/job123"
                  type="url"
                  value={jobDetails.applyUrl}
                  onChange={handleInputChange}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Job Description*</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Paste the full job description here..."
                  className="min-h-[200px]"
                  value={jobDetails.description}
                  onChange={handleInputChange}
                  required
                />
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing match...
                  </>
                ) : (
                  <>Analyze Match</>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        {/* Match results card */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Match Results</CardTitle>
            <CardDescription>
              AI analysis of how well your profile matches this job
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!matchResult && !isLoading && (
              <div className="flex flex-col items-center justify-center h-[400px] text-center text-gray-500">
                <div className="mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <path d="M3.29 7L12 12l8.71-5" />
                    <path d="M12 22V12" />
                  </svg>
                </div>
                <p className="text-lg font-medium">No Match Results Yet</p>
                <p className="mt-2">Enter job details and click "Analyze Match" to see your results</p>
              </div>
            )}
            
            {isLoading && (
              <div className="flex flex-col items-center justify-center h-[400px]">
                <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">Analyzing Job Match</p>
                <p className="text-gray-500 mt-2">
                  Our AI is comparing your resume with the job description...
                </p>
              </div>
            )}
            
            {matchResult && (
              <div className="space-y-6">
                <div className="flex flex-col items-center p-6 rounded-lg bg-gray-50 dark:bg-gray-900">
                  <div className="text-center">
                    <h3 className="text-xl font-medium mb-2">Your Match Score</h3>
                    <div className="text-5xl font-bold mb-4">
                      {matchResult.matchScore}%
                    </div>
                    <Badge variant={getMatchBadgeVariant(matchResult.matchScore)} className="px-3 py-1 text-sm">
                      {matchResult.matchScore >= 80 ? "Excellent Match" : 
                       matchResult.matchScore >= 60 ? "Good Match" :
                       matchResult.matchScore >= 40 ? "Fair Match" : "Poor Match"}
                    </Badge>
                  </div>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-3">Match Analysis</h3>
                  <Separator className="mb-4" />
                  <ul className="space-y-3">
                    {matchResult.matchReasons.map((reason, index) => (
                      <li key={index} className="flex items-start">
                        {matchResult.matchScore >= 60 ? 
                          <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" /> : 
                          <AlertCircle className="h-5 w-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" />
                        }
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="rounded-lg bg-primary/10 p-4">
                  <p className="text-sm font-medium">
                    {matchResult.matchScore >= 80 ? 
                      "You're an excellent match for this position! Consider applying right away." : 
                      matchResult.matchScore >= 60 ? 
                      "You're a good match for this position. Highlight your relevant skills when applying." :
                      "You're not a strong match for this position, but you can still apply by emphasizing your transferable skills."}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="border-t pt-6 flex flex-col items-start">
            <p className="text-xs text-gray-500">
              This AI matching system uses advanced natural language processing to compare your resume with job descriptions. 
              Results are for informational purposes and may not reflect actual hiring decisions.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}