import { useState, ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileType, Eye, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, API_BASE_URL } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

interface ResumeData {
  id: number;
  userId: number;
  filename: string;
  parsedText: string | null; // Parsed text content from the resume
  uploadedAt: string; // ISO date string
  resumeText: string | null; // From user table, returned in the API
  userSummary: string | null; // From user table, returned in the API
}

export default function ResumeCard() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);

  const { data: resume, isLoading } = useQuery<ResumeData | null, Error>({
    queryKey: ["/api/resume"], // React Query key, doesn't need base URL
    queryFn: async ({ queryKey }) => {
      const relativePath = queryKey[0] as string;
      const url = `${API_BASE_URL}${relativePath}`; // Construct full URL

      const res = await fetch(url, {
        credentials: "include",
      });
      if (res.status === 404) {
        return null; // No resume found for the user
      }
      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`Failed to fetch resume: ${res.status} ${errorText}`);
      }
      return await res.json();
    },
    retry: false,
  });

  const uploadMutation = useMutation<ResumeData, Error, File>({
    // Added types for mutation
    mutationFn: async (fileToUpload: File) => {
      const formData = new FormData();
      formData.append("resume", fileToUpload);

      const url = `${API_BASE_URL}/api/resume`; // Construct full URL
      const response = await fetch(url, {
        method: "POST",
        body: formData,
        credentials: "include",
        // For FormData, browser sets Content-Type automatically with boundary
      });

      if (!response.ok) {
        const errorText = await response
          .text()
          .catch(() => response.statusText);
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/resume"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-summary"] }); // Also invalidate user summary if resume impacts it
      toast({
        title: "Resume uploaded",
        description:
          "Your resume has been successfully uploaded and processed.",
      });
      setFile(null); // Clear the file input state
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) {
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      e.target.value = ""; // Clear the file input
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      // 10MB
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      e.target.value = ""; // Clear the file input
      return;
    }

    setFile(selectedFile); // You might want to show the selected file name in UI
    uploadMutation.mutate(selectedFile);
    e.target.value = ""; // Clear the file input after selection to allow re-uploading same file
  };

  const handleViewResume = () => {
    // This endpoint should serve the file directly
    const url = `${API_BASE_URL}/api/resume/download`;
    window.open(url, "_blank");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Resume</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />{" "}
            <Skeleton className="h-8 w-1/2" />
          </div>
        ) : !resume ? (
          <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed border-border rounded-md">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <div className="flex text-sm text-muted-foreground justify-center">
                <label
                  htmlFor="dashboard-resume-upload"
                  className="relative cursor-pointer bg-background rounded-md font-medium text-primary hover:text-primary/80 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary"
                >
                  <span>Upload a file</span>
                  <input
                    id="dashboard-resume-upload"
                    name="resume"
                    type="file"
                    className="sr-only"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={uploadMutation.isPending}
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-muted-foreground">PDF up to 10MB</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col p-4 border border-border rounded-md space-y-3">
            {/* Top Part: File icon and filename */}
            <div className="flex items-center min-w-0">
              <FileType className="h-6 w-6 text-primary mr-3 flex-shrink-0" />
              <span className="text-sm text-foreground block overflow-hidden text-ellipsis whitespace-nowrap">
                {resume.filename}
              </span>
            </div>

            {/* Bottom Part: View and Replace buttons */}
            <div className="flex space-x-2 justify-start">
              {" "}
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewResume}
                disabled={!resume.filename}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <label className="relative">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={uploadMutation.isPending}
                >
                  <span>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Replace
                  </span>
                </Button>
                <input
                  type="file"
                  className="sr-only"
                  accept=".pdf"
                  onChange={handleFileChange}
                  disabled={uploadMutation.isPending}
                />
              </label>
            </div>
          </div>
        )}

        {uploadMutation.isPending && (
          <div className="mt-3 text-sm text-center text-muted-foreground">
            Uploading resume...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
