import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

export default function WorkableTestPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobUrl, setJobUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Example job URLs to try with
  const exampleUrls = [
    // These use the new pattern we discovered - jobs.workable.com/view/ID/job-title
    "https://jobs.workable.com/view/uPWpBYDHx3jDvic5VhL3U5/remote-software-engineer-in-tokyo-at-wizcorp-inc",
    "https://jobs.workable.com/view/a3bTJxnM4R17a7hP4CeXQp/machine-learning-engineer",
    "https://jobs.workable.com/view/gj3Jqnq4BBLBu6yVFAU6PN/full-stack-engineer"
  ];
  
  // Function to check if URL is valid
  const isValidWorkableUrl = (url: string) => {
    // Check for both patterns - either direct apply URLs or job listing URLs
    const isDirectApplyUrl = url.includes('apply.workable.com') && url.includes('/j/');
    const isJobListingUrl = url.includes('jobs.workable.com/view/');
    return isDirectApplyUrl || isJobListingUrl;
  };
  
  // Handler to use example URL
  const useExampleUrl = (url: string) => {
    setJobUrl(url);
  };
  
  // Handler to submit the form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Reset states
    setError(null);
    setResults(null);
    
    // Validate URL format
    if (!isValidWorkableUrl(jobUrl)) {
      setError("Please enter a valid Workable job URL (e.g., https://jobs.workable.com/view/ID/job-title)");
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Submit to our test endpoint
      const response = await fetch("/app_direct/workable/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobUrl,
          userId: user?.id || 1, // Use authenticated user ID if available
        })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({
          title: "Success!",
          description: "Successfully tested job application with Playwright worker",
        });
      } else {
        toast({
          title: "Test failed",
          description: data.error || "Something went wrong",
          variant: "destructive"
        });
      }
      
      // Store the results
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Workable Job Application Test</h1>
      <div className="mb-6 space-y-4">
        <p className="text-gray-600">
          This page tests the Playwright worker's ability to process a Workable job application.
          Enter a valid Workable job URL and click "Test" to see if the worker can navigate to the job page.
        </p>
        
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4">
          <h3 className="font-medium text-amber-800 mb-2">How Workable Job Applications Work</h3>
          <ol className="list-decimal list-inside text-sm text-amber-700 space-y-2">
            <li>We start by searching for jobs at <code className="bg-amber-100 px-1">jobs.workable.com</code></li>
            <li>Then we find job links like <code className="bg-amber-100 px-1">https://jobs.workable.com/view/ID/job-title</code></li>
            <li>When we visit the job page, we click the "Apply Now" button which opens a modal with the application form</li>
            <li>The worker will then fill out the form fields with the user's information</li>
          </ol>
          
          <div className="mt-4 p-3 bg-white rounded border border-amber-100">
            <h4 className="text-sm font-medium text-amber-800 mb-2">Application Flow Example</h4>
            <div className="flex items-center text-xs text-amber-700">
              <div className="rounded bg-amber-100 p-2">
                <span>Search Page</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-2"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              <div className="rounded bg-amber-100 p-2">
                <span>Job Listing</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-2"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              <div className="rounded bg-green-100 p-2 text-green-700">
                <span>Click "Apply Now"</span>
              </div>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-2"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              <div className="rounded bg-blue-100 p-2 text-blue-700">
                <span>Modal Form Opens</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Test Workable Application</CardTitle>
          <CardDescription>
            Enter a Workable job URL to test the application process
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="jobUrl">Workable Job URL</Label>
              <Input
                id="jobUrl"
                placeholder="https://jobs.workable.com/view/ID/job-title"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                required
                className="w-full"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
            
            <div className="mt-4">
              <h4 className="text-sm font-medium mb-2">Example URLs to try</h4>
              <div className="space-y-2">
                {exampleUrls.map((url, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => useExampleUrl(url)}
                      className="text-xs"
                    >
                      Use
                    </Button>
                    <code className="text-xs bg-gray-100 p-1 rounded">{url}</code>
                  </div>
                ))}
              </div>
            </div>
          </form>
        </CardContent>
        
        <CardFooter>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isLoading ? "Testing..." : "Test Job Application"}
          </Button>
        </CardFooter>
      </Card>
      
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Test Results</CardTitle>
            <CardDescription>
              Results from the Playwright worker test
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="bg-gray-100 p-4 rounded-md overflow-auto max-h-96">
              <pre className="text-sm">{JSON.stringify(results, null, 2)}</pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}