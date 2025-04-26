import React, { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePortfolio } from "@/hooks/use-portfolio";
import { useProfile } from "@/hooks/use-profile";
import { Loader2, Upload, File, Trash2, ExternalLink } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function PortfolioManagement() {
  const { portfolios, isLoading, uploadPortfolio, deletePortfolio, isUploading, isDeleting } = usePortfolio();
  const { completeness } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setSelectedFile(file);
    setUploadError(null);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      setUploadError("Please select a file to upload");
      return;
    }

    // Check file size (5MB max)
    if (selectedFile.size > 5 * 1024 * 1024) {
      setUploadError("File size exceeds 5MB limit");
      return;
    }

    // Check file type
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(selectedFile.type)) {
      setUploadError("Invalid file type. Allowed types: PDF, images, and MS Office documents");
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);
    
    uploadPortfolio(formData);
    setSelectedFile(null);
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeletePortfolio = (portfolioId: number) => {
    deletePortfolio(portfolioId);
  };

  // Function to render the file type badge
  const renderFileTypeBadge = (fileType: string) => {
    if (fileType.includes('pdf')) {
      return <Badge variant="outline" className="bg-red-100">PDF</Badge>;
    } else if (fileType.includes('image')) {
      return <Badge variant="outline" className="bg-blue-100">Image</Badge>;
    } else if (fileType.includes('word')) {
      return <Badge variant="outline" className="bg-indigo-100">Word</Badge>;
    } else {
      return <Badge variant="outline">Document</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio Management</CardTitle>
        <CardDescription>
          Upload and manage your portfolio files, certifications, and work samples
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="portfolio-file"
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer bg-muted/30 hover:bg-muted/50"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-muted-foreground" />
                  <p className="mb-2 text-sm text-muted-foreground">
                    <span className="font-medium">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, Images, or Documents (Max 5MB)
                  </p>
                  {selectedFile && (
                    <p className="mt-2 text-sm font-medium text-primary">{selectedFile.name}</p>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  id="portfolio-file"
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".pdf,.png,.jpg,.jpeg,.gif,.doc,.docx"
                />
              </label>
            </div>

            {uploadError && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{uploadError}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isUploading || !selectedFile}>
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload File"
              )}
            </Button>
          </form>

          <div className="space-y-2">
            <h3 className="text-lg font-medium">Your Portfolio Files</h3>
            
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : portfolios.length === 0 ? (
              <div className="text-center py-8 border rounded-lg bg-muted/30">
                <File className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-2 text-sm font-medium text-foreground">No files uploaded</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload your portfolio files, certificates, or work samples to showcase your skills
                </p>
                <div className="mt-6">
                  <Button onClick={handleUploadClick}>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload a file
                  </Button>
                </div>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Uploaded On</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolios.map((portfolio) => (
                      <TableRow key={portfolio.id}>
                        <TableCell className="font-medium">{portfolio.filename}</TableCell>
                        <TableCell>{renderFileTypeBadge(portfolio.fileType)}</TableCell>
                        <TableCell>
                          {new Date(portfolio.uploadedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <a
                              href={`/api/profile/portfolio/${portfolio.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span className="sr-only">View</span>
                            </a>
                            
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                  disabled={isDeleting}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4" />
                                  )}
                                  <span className="sr-only">Delete</span>
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Portfolio File</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{portfolio.filename}"? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeletePortfolio(portfolio.id)}
                                    className="bg-red-500 hover:bg-red-700 text-white"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}