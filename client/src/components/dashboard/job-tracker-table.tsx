import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Pencil,
  Trash2,
  ExternalLink,
  Loader2,
  RefreshCw,
  AlertCircle,
  Check,
  Clock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pagination } from "@/components/ui/pagination";

interface Job {
  id: number;
  jobTitle: string;
  company: string;
  link: string;
  status: string;
  applicationStatus?: string; // 'pending', 'applied', 'skipped', 'failed'
  notes: string;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  submittedAt?: string;
  matchScore?: number; // Optional match score for auto-applied jobs
  matchExplanation?: string; // Explanation of why the job is a good match
  source?: string; // Source of the job (e.g., "adzuna", "linkedin", etc.)
  externalJobId?: string;
}

interface PaginatedJobsResponse {
  jobs: Job[];
  total: number;
  page: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export default function JobTrackerTable() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [matchScoreFilter, setMatchScoreFilter] = useState<number>(0);
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [deleteConfirmJobId, setDeleteConfirmJobId] = useState<number | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewMatchDetailsJobId, setViewMatchDetailsJobId] = useState<number | null>(null);
  const [matchDetailsOpen, setMatchDetailsOpen] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: paginatedData, isLoading, error } = useQuery<PaginatedJobsResponse | Job[]>({
    queryKey: [`/api/jobs?page=${currentPage}&limit=${itemsPerPage}`],
    retry: 1, // Retry once on failure
    refetchOnWindowFocus: false,
  });

  // Handle both paginated and legacy response formats
  const jobs = Array.isArray(paginatedData) ? paginatedData : paginatedData?.jobs || [];
  const totalPages = Array.isArray(paginatedData) ? 1 : paginatedData?.totalPages || 1;
  const totalJobs = Array.isArray(paginatedData) ? paginatedData.length : paginatedData?.total || 0;

  const updateJobMutation = useMutation({
    mutationFn: async (job: Job) => {
      const res = await apiRequest("PUT", `/api/jobs/${job.id}`, job);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key === "/api/jobs" || (typeof key === "string" && key.startsWith("/api/jobs?"));
        }
      });
      toast({
        title: "Job updated",
        description: "The job has been updated successfully.",
      });
      setEditDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Failed to update job",
        variant: "destructive",
      });
    },
  });

  const deleteJobMutation = useMutation({
    mutationFn: async (jobId: number) => {
      await apiRequest("DELETE", `/api/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key === "/api/jobs" || (typeof key === "string" && key.startsWith("/api/jobs?"));
        }
      });
      toast({
        title: "Job deleted",
        description: "The job has been removed from your tracker.",
      });
      setDeleteDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete job",
        variant: "destructive",
      });
    },
  });

  const resubmitApplicationMutation = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/resubmit`);
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0] as string;
          return key === "/api/jobs" || (typeof key === "string" && key.startsWith("/api/jobs?"));
        }
      });
      toast({
        title: "Application resubmitted",
        description: data.message || "The application has been resubmitted.",
      });
    },
    onError: (error) => {
      toast({
        title: "Resubmission failed",
        description: error instanceof Error ? error.message : "Failed to resubmit application",
        variant: "destructive",
      });
    },
  });

  const handleEditJob = (job: Job) => {
    setEditingJob(job);
    setEditDialogOpen(true);
  };

  const handleDeleteJob = (jobId: number) => {
    setDeleteConfirmJobId(jobId);
    setDeleteDialogOpen(true);
  };

  const handleUpdateJob = () => {
    if (editingJob) {
      updateJobMutation.mutate(editingJob);
    }
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmJobId !== null) {
      deleteJobMutation.mutate(deleteConfirmJobId);
    }
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Filter jobs based on selected filters (now applied to current page only)
  const filteredJobs = jobs?.filter((job) => {
    // Status filter (case-insensitive)
    const statusMatches = statusFilter === "all" ? true
      : job.status.toLowerCase() === statusFilter.toLowerCase();

    // Application status filter
    const applicationStatusMatches = applicationStatusFilter === "all" ? true
      : job.applicationStatus?.toLowerCase() === applicationStatusFilter.toLowerCase();

    // Source filter
    const sourceMatches = sourceFilter === "all" ? true
      : (job.source?.toLowerCase() === sourceFilter.toLowerCase());

    // Match score filter
    const matchScoreMatches = !job.matchScore ? matchScoreFilter === 0
      : job.matchScore >= matchScoreFilter;

    return statusMatches && applicationStatusMatches && sourceMatches && matchScoreMatches;
  });

  // Get unique sources for the filter (from current page only)
  const jobSources = jobs
    ? Array.from(new Set(jobs.filter(job => job.source).map(job => job.source!)))
    : [];

  const handleViewMatchDetails = (jobId: number) => {
    setViewMatchDetailsJobId(jobId);
    setMatchDetailsOpen(true);
  };

  const handleResubmitApplication = (jobId: number) => {
    resubmitApplicationMutation.mutate(jobId);
  };

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "saved":
        return <Badge variant="outline">Saved</Badge>;
      case "applied":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Applied</Badge>;
      case "interview":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Interview</Badge>;
      case "offer":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Offer</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100" variant="outline">Rejected</Badge>;
      case "error":
      case "failed":
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getApplicationStatusBadge = (status?: string) => {
    if (!status) return null;

    switch (status.toLowerCase()) {
      case "pending":
        return (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-yellow-600" />
            <span className="text-xs text-yellow-600">Pending</span>
          </div>
        );
      case "applied":
        return (
          <div className="flex items-center gap-1">
            <Check className="h-3 w-3 text-green-600" />
            <span className="text-xs text-green-600">Applied</span>
          </div>
        );
      case "skipped":
        return (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-blue-600" />
            <span className="text-xs text-blue-600">Skipped</span>
          </div>
        );
      case "failed":
        return (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-600" />
            <span className="text-xs text-red-600">Failed</span>
          </div>
        );
      default:
        return null;
    }
  };

  const getSourceBadge = (source?: string) => {
    if (!source) return null;

    switch (source.toLowerCase()) {
      case "adzuna":
        return <Badge variant="outline" className="bg-blue-50">Adzuna</Badge>;
      case "linkedin":
        return <Badge variant="outline" className="bg-blue-50">LinkedIn</Badge>;
      case "indeed":
        return <Badge variant="outline" className="bg-blue-50">Indeed</Badge>;
      default:
        return <Badge variant="outline">{source}</Badge>;
    }
  };

  function renderJobsTable(jobsToRender?: Job[]) {
    if (isLoading) {
      return (
        <div className="space-y-3">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      );
    }

    // Show error if query failed
    if (error) {
      return (
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 font-medium">Failed to load jobs</p>
          <p className="text-sm text-gray-500 mt-2">{String(error)}</p>
          <Button 
            variant="outline" 
            className="mt-4"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobsToRender && jobsToRender.length > 0 ? (
              jobsToRender.map((job) => (
                <TableRow key={job.id}>
                  <TableCell className="font-medium">
                    <div>
                      {job.link ? (
                        <a
                          href={job.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-600 flex items-center gap-1"
                        >
                          {job.jobTitle}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        job.jobTitle
                      )}
                      {job.applicationStatus && (
                        <div className="mt-1">
                          {getApplicationStatusBadge(job.applicationStatus)}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{job.company}</span>
                      {job.source && (
                        <span className="mt-1">{getSourceBadge(job.source)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{job.source || '—'}</TableCell>
                  <TableCell>
                    {job.matchScore ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              className="p-0 h-auto"
                              onClick={() => job.matchExplanation && handleViewMatchDetails(job.id)}
                            >
                              <Badge className={
                                job.matchScore >= 80 ? "bg-green-100 text-green-800 hover:bg-green-100" :
                                  job.matchScore >= 60 ? "bg-blue-100 text-blue-800 hover:bg-blue-100" :
                                    "bg-gray-100 text-gray-800 hover:bg-gray-100"
                              }>
                                {job.matchScore}%
                              </Badge>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {job.matchExplanation ?
                              "Click to view match details" :
                              "No match details available"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end space-x-1">
                      {/* Show Resubmit button for failed applications */}
                      {(job.applicationStatus === "failed" || job.status === "Error" || job.status === "Failed") && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleResubmitApplication(job.id)}
                                disabled={resubmitApplicationMutation.isPending && resubmitApplicationMutation.variables === job.id}
                              >
                                {resubmitApplicationMutation.isPending && resubmitApplicationMutation.variables === job.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4 text-blue-600" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Resubmit application</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditJob(job)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit job</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteJob(job.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delete job</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading jobs...
                    </div>
                  ) : error ? (
                    <div className="text-red-600">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                      <p>Failed to load jobs: {String(error)}</p>
                    </div>
                  ) : (
                    <div>
                      {totalJobs > 0 ? (
                        <div>
                          <p>No jobs match the current filters.</p>
                          <p className="text-sm mt-1">
                            Showing page {currentPage} of {totalPages} ({totalJobs} total jobs)
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p>No jobs in your tracker yet.</p>
                          <p className="text-sm mt-2">Add your first job using the form above, or</p>
                          <p className="text-sm">use the "Find Jobs" feature to discover opportunities.</p>
                        </div>
                      )}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-row items-center justify-between mb-2">
          <div>
            <CardTitle>Job Tracker</CardTitle>
            <CardDescription>
              Track all your job applications in one place.
            </CardDescription>
          </div>
        </div>

        {/* Filter Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <div className="flex justify-between items-center mb-4">
            <TabsList>
              <TabsTrigger value="all">All Jobs</TabsTrigger>
              <TabsTrigger value="applied">Applied</TabsTrigger>
              <TabsTrigger value="saved">Saved</TabsTrigger>
              <TabsTrigger value="failed">Failed</TabsTrigger>
            </TabsList>

            <div className="flex space-x-2">
              {jobSources.length > 0 && (
                <Select
                  value={sourceFilter}
                  onValueChange={setSourceFilter}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    {jobSources.map(source => (
                      <SelectItem key={source} value={source}>{source}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select
                value={statusFilter}
                onValueChange={setStatusFilter}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="saved">Saved</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="interview">Interview</SelectItem>
                  <SelectItem value="offer">Offer</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="Error">Failed</SelectItem>
                </SelectContent>
              </Select>

              {jobs?.some(job => job.matchScore) && (
                <div className="w-[200px] flex items-center space-x-2">
                  <Label htmlFor="match-score" className="whitespace-nowrap text-xs">
                    Match: {matchScoreFilter}%+
                  </Label>
                  <Slider
                    id="match-score"
                    min={0}
                    max={100}
                    step={10}
                    value={[matchScoreFilter]}
                    onValueChange={(value) => setMatchScoreFilter(value[0])}
                    className="flex-1"
                  />
                </div>
              )}
            </div>
          </div>

          <TabsContent value="all">
            {renderJobsTable(filteredJobs)}
          </TabsContent>
          <TabsContent value="applied">
            {renderJobsTable(filteredJobs?.filter(job =>
              job.status.toLowerCase() === "applied" ||
              job.applicationStatus?.toLowerCase() === "applied"
            ))}
          </TabsContent>
          <TabsContent value="saved">
            {renderJobsTable(filteredJobs?.filter(job => job.status.toLowerCase() === "saved"))}
          </TabsContent>
          <TabsContent value="failed">
            {renderJobsTable(filteredJobs?.filter(job =>
              job.status.toLowerCase() === "error" ||
              job.status.toLowerCase() === "failed" ||
              job.applicationStatus?.toLowerCase() === "failed"
            ))}
          </TabsContent>
        </Tabs>

        {/* Pagination and Summary */}
        {totalPages > 1 && (
          <div className="flex flex-col items-center space-y-4 mt-6">
            {/* Summary */}
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalJobs)} of {totalJobs} jobs
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {/* Edit Job Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Job</DialogTitle>
              <DialogDescription>
                Update the job details in your tracker.
              </DialogDescription>
            </DialogHeader>
            {editingJob && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="job-title" className="text-right">
                    Job Title
                  </Label>
                  <Input
                    id="job-title"
                    value={editingJob.jobTitle}
                    onChange={(e) => setEditingJob({ ...editingJob, jobTitle: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="company" className="text-right">
                    Company
                  </Label>
                  <Input
                    id="company"
                    value={editingJob.company}
                    onChange={(e) => setEditingJob({ ...editingJob, company: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="link" className="text-right">
                    Job Link
                  </Label>
                  <Input
                    id="link"
                    value={editingJob.link || ""}
                    onChange={(e) => setEditingJob({ ...editingJob, link: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="status" className="text-right">
                    Status
                  </Label>
                  <Select
                    value={editingJob.status}
                    onValueChange={(value) => setEditingJob({ ...editingJob, status: value })}
                  >
                    <SelectTrigger id="status" className="col-span-3">
                      <SelectValue placeholder="Select a status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="saved">Saved</SelectItem>
                      <SelectItem value="applied">Applied</SelectItem>
                      <SelectItem value="interview">Interview</SelectItem>
                      <SelectItem value="offer">Offer</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="Error">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">
                    Notes
                  </Label>
                  <Input
                    id="notes"
                    value={editingJob.notes || ""}
                    onChange={(e) => setEditingJob({ ...editingJob, notes: e.target.value })}
                    className="col-span-3"
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                onClick={handleUpdateJob}
                disabled={updateJobMutation.isPending}
              >
                {updateJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the job from your tracker.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                disabled={deleteJobMutation.isPending}
              >
                {deleteJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Match Details Dialog */}
        <Dialog open={matchDetailsOpen} onOpenChange={setMatchDetailsOpen}>
          <DialogContent className="sm:max-w-[550px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Match Details</DialogTitle>
              <DialogDescription>
                Why this job matches your profile
              </DialogDescription>
            </DialogHeader>
            {viewMatchDetailsJobId && jobs && (
              <>
                {(() => {
                  const job = jobs.find(j => j.id === viewMatchDetailsJobId);
                  if (!job) return <p>Job not found</p>;
                  return (
                    <div className="py-4">
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold">{job.jobTitle} at {job.company}</h3>
                        <div className="flex items-center mt-2">
                          <Badge className={
                            job.matchScore && job.matchScore >= 80 ? "bg-green-100 text-green-800 hover:bg-green-100" :
                              job.matchScore && job.matchScore >= 60 ? "bg-blue-100 text-blue-800 hover:bg-blue-100" :
                                "bg-gray-100 text-gray-800 hover:bg-gray-100"
                          }>
                            {job.matchScore}% Match
                          </Badge>
                        </div>
                      </div>

                      <div className="border-t pt-4">
                        <h4 className="font-medium mb-2">Why this job matches your profile:</h4>
                        {job.matchExplanation ? (
                          <div className="text-sm whitespace-pre-line">
                            {job.matchExplanation}
                          </div>
                        ) : (
                          <p className="text-muted-foreground">No details available</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
            <DialogFooter>
              <Button onClick={() => setMatchDetailsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}