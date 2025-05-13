import { useState, ChangeEvent } from "react";
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileType, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/queryClient";

interface ResumeUploadProps {
  onComplete: () => void;
  onBack: () => void;
  isLoading: boolean;
}

export default function ResumeUpload({
  onComplete,
  onBack,
  isLoading,
}: ResumeUploadProps) {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];

    if (!selectedFile) {
      setFile(null); // Clear previous file if any
      return;
    }

    if (selectedFile.type !== "application/pdf") {
      toast({
        title: "Invalid file type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      e.target.value = ""; // Clear the file input
      setFile(null);
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
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setUploadSuccess(false); // Reset success status if a new file is selected
  };

  const handleUploadResume = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a PDF file to upload.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("resume", file);

      const url = `${API_BASE_URL}/api/resume`;
      console.log(`[ResumeUpload] Uploading resume to: ${url}`);

      const response = await fetch(url, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        // Try to get error message from backend
        const errorData = await response
          .json()
          .catch(() => ({
            message: `Upload failed: ${response.status} ${response.statusText}`,
          }));
        throw new Error(
          errorData.message ||
            `Upload failed: ${response.status} ${response.statusText}`
        );
      }

      setUploadSuccess(true);
      toast({
        title: "Resume uploaded",
        description: "Your resume has been successfully uploaded.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReplace = () => {
    setFile(null);
    setUploadSuccess(false);
    // Consider also clearing the file input if you have a ref to it
    const fileInput = document.getElementById(
      "resume-upload"
    ) as HTMLInputElement | null;
    if (fileInput) {
      fileInput.value = "";
    }
  };

  return (
    <>
      <CardHeader>
        <CardTitle>Upload Your Resume</CardTitle>
        <CardDescription>
          Upload your resume to complete your profile. You can update it anytime
          from your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!file || !uploadSuccess ? (
          <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
            <div className="space-y-1 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div className="flex text-sm text-gray-600 justify-center">
                <label
                  htmlFor="resume-upload"
                  className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500"
                >
                  <span>Upload a file</span>
                  <input
                    id="resume-upload"
                    name="resume"
                    type="file"
                    className="sr-only"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={isUploading || isLoading} // Also consider general isLoading prop
                  />
                </label>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-gray-500">PDF up to 10MB</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-md">
              <div className="flex items-center">
                <FileType className="h-8 w-8 text-primary-500 mr-3" />
                <div>
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReplace}
                disabled={isUploading || isLoading}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Replace
              </Button>
            </div>
          </div>
        )}

        {file && !uploadSuccess && (
          <div className="mt-4 flex justify-center">
            <Button
              onClick={handleUploadResume}
              disabled={isUploading || isLoading}
              className="w-full sm:w-auto"
            >
              {isUploading ? "Uploading..." : "Upload Resume"}
            </Button>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isLoading || isUploading}
        >
          Back
        </Button>
        <Button
          onClick={onComplete}
          disabled={isLoading || isUploading || !file || !uploadSuccess} // Only allow complete if file uploaded
        >
          {isLoading ? "Saving..." : "Next Step"}
          {/* Changed "Complete Profile" to "Next Step" as profile might not be complete yet */}
        </Button>
      </CardFooter>
    </>
  );
}
