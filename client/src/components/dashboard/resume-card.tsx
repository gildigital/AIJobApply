import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileType, Eye, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

export default function ResumeCard() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  
  const { data: resume, isLoading } = useQuery({
    queryKey: ["/api/resume"],
    queryFn: async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, {
        credentials: "include",
      });
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) {
        throw new Error("Failed to fetch resume");
      }
      return await res.json();
    },
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (fileToUpload: File) => {
      const formData = new FormData();
      formData.append('resume', fileToUpload);
      
      const response = await fetch('/api/resume', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resume"] });
      toast({
        title: "Resume uploaded",
        description: "Your resume has been successfully uploaded.",
      });
      setFile(null);
    },
    onError: (error) => {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    
    if (!selectedFile) {
      return;
    }
    
    if (selectedFile.type !== 'application/pdf') {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      return;
    }
    
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 10MB.",
        variant: "destructive",
      });
      return;
    }
    
    setFile(selectedFile);
    uploadMutation.mutate(selectedFile);
  };

  const handleViewResume = () => {
    window.open('/api/resume/download', '_blank');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Resume</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : !resume ? (
          <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600 justify-center">
                <label htmlFor="dashboard-resume-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500">
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
              <p className="text-xs text-gray-500">
                PDF up to 10MB
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
            <div className="flex items-center">
              <FileType className="h-6 w-6 text-primary-500 mr-3" />
              <span className="text-sm text-gray-700">{resume.filename}</span>
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" size="sm" onClick={handleViewResume}>
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <label className="relative">
                <Button variant="outline" size="sm" asChild>
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
          <div className="mt-3 text-sm text-center text-gray-500">
            Uploading resume...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
