import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Type definitions
export interface QueueStatusResponse {
  status: {
    queuedJobs: number;
    completedJobs: number;
    failedJobs: number;
    dailyLimit: number;
    appliedToday: number;
    isWorkerRunning: boolean;
  };
  queuedJobDetails: Array<{
    queueId: number;
    queueStatus: "pending" | "processing" | "completed" | "failed";
    priority: number;
    error: string | null;
    createdAt: string;
    processedAt: string | null;
    job: {
      id: number;
      jobTitle: string;
      company: string;
    };
  }>;
  success: boolean;
}

export function useQueueStatus() {
  const { toast } = useToast();
  
  // Query for getting queue status
  const {
    data,
    isLoading,
    error,
    refetch
  } = useQuery<QueueStatusResponse>({
    queryKey: ['/api/job-queue/status'],
    refetchInterval: 5000, // Poll every 5 seconds
  });
  
  // Mutation for enqueueing jobs
  const enqueueMutation = useMutation({
    mutationFn: async (jobIds: number[]) => {
      const response = await apiRequest('POST', '/api/job-queue/enqueue', { jobIds });
      return response.json();
    },
    onSuccess: (data) => {
      // Invalidate the queue status query to refetch it
      queryClient.invalidateQueries({ queryKey: ['/api/job-queue/status'] });
      
      // Show success toast
      toast({
        title: "Auto-apply started",
        description: `Successfully enqueued ${data.queuedJobs?.length || 0} jobs`,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      console.error("Error enqueueing jobs:", error);
      
      const errorMessage = 
        error.message.includes("limit reached") ? "You've reached your daily apply limit" : 
        error.message.includes("Queue is full") ? "Queue is full" :
        "Failed to start auto-apply";
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  });
  
  // Calculate processed jobs count
  const processedCount = data ? (data.status.completedJobs) : 0;
  
  // Calculate counts for different statuses
  const counts = {
    pending: data?.queuedJobDetails.filter(j => j.queueStatus === "pending").length || 0,
    processing: data?.queuedJobDetails.filter(j => j.queueStatus === "processing").length || 0,
    completed: processedCount,
    failed: data?.status.failedJobs || 0,
    totalQueued: data?.status.queuedJobs || 0,
    dailyLimit: data?.status.dailyLimit || 0,
    appliedToday: data?.status.appliedToday || 0,
    remaining: data ? (data.status.dailyLimit - data.status.appliedToday) : 0,
    isWorkerRunning: data?.status.isWorkerRunning || false
  };
  
  return {
    data,
    isLoading,
    error,
    refetch,
    enqueueMutation,
    counts,
    queuedJobDetails: data?.queuedJobDetails || []
  };
}