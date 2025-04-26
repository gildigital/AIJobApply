import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function WorkableSchemaTest() {
  const [jobUrl, setJobUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("introspect");
  const { toast } = useToast();

  const handleIntrospect = async () => {
    if (!jobUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Workable job URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResults(null);

    try {
      const response = await apiRequest("POST", "/api/test/workable/introspect", { jobUrl });
      const data = await response.json();
      setResults(data);

      if (data.success) {
        toast({
          title: "Success",
          description: "Job form introspection completed successfully",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to introspect job form",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error introspecting job form:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!jobUrl.trim()) {
      toast({
        title: "Error",
        description: "Please enter a Workable job URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    setResults(null);

    try {
      const response = await apiRequest("POST", "/api/test/workable/submit", { jobUrl });
      const data = await response.json();
      setResults(data);

      if (data.success) {
        toast({
          title: "Success",
          description: "Application submitted successfully",
        });
      } else if (data.skipped) {
        toast({
          title: "Application Skipped",
          description: data.reason || "The application was skipped",
          variant: "default",
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to submit application",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error submitting application:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Workable Schema-Driven Approach Test</h1>
      <p className="text-gray-600 mb-6">
        This page allows you to test the new intelligent schema-driven approach for Workable job applications.
        The process happens in two phases:
      </p>
      <ol className="list-decimal pl-8 mb-8 space-y-2">
        <li>
          <strong>Introspection:</strong> Analyze the form structure to understand what fields are required
        </li>
        <li>
          <strong>Submission:</strong> Prepare the data and submit the application based on the discovered schema
        </li>
      </ol>

      <div className="mb-6">
        <label htmlFor="jobUrl" className="block text-sm font-medium mb-2">
          Workable Job URL
        </label>
        <div className="flex gap-2">
          <Input
            id="jobUrl"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="https://jobs.workable.com/view/..."
            className="flex-1"
          />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="grid grid-cols-2 w-[400px]">
          <TabsTrigger value="introspect">1. Introspect Form</TabsTrigger>
          <TabsTrigger value="submit">2. Submit Application</TabsTrigger>
        </TabsList>
        <TabsContent value="introspect" className="pt-4">
          <p className="mb-4">
            The introspection phase analyzes the job application form structure. This step identifies all required fields
            and prepares the system to fill them correctly during submission.
          </p>
          <Button
            onClick={handleIntrospect}
            disabled={isLoading}
            className="w-full md:w-auto"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Introspect Form Structure
          </Button>
        </TabsContent>
        <TabsContent value="submit" className="pt-4">
          <p className="mb-4">
            The submission phase will use test data to attempt an actual application. This uses a pre-configured test
            user profile with placeholder information.
          </p>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full md:w-auto"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Test Application
          </Button>
        </TabsContent>
      </Tabs>

      {isLoading && (
        <div className="flex justify-center my-8">
          <Loader2 size={36} className="animate-spin text-primary" />
        </div>
      )}

      {results && (
        <Card className="p-6 mt-6 bg-background border-border">
          <h2 className="text-xl font-bold mb-4">Results</h2>
          <pre className="bg-muted p-4 rounded-md overflow-auto max-h-[500px] text-sm">
            {JSON.stringify(results, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}