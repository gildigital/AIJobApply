import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface Job {
  id: number;
  userId: number;
  jobTitle: string;
  company: string;
  link?: string;
  status: string;
  applicationStatus?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  appliedAt?: string;
  submittedAt?: string;
  externalJobId?: string;
  matchScore?: number;
  matchExplanation?: string;
  source?: string;
}

export function useJobs() {
  const { toast } = useToast();
  
  const {
    data: jobs = [],
    isLoading,
    error,
    isError,
    refetch
  } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
  });
  
  const updateJobMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Job> }) => {
      const response = await apiRequest('PUT', `/api/jobs/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/jobs"
      });
      toast({
        title: "Job updated",
        description: "The job has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to update job: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  const createJobMutation = useMutation({
    mutationFn: async (data: Partial<Job>) => {
      const response = await apiRequest('POST', '/api/jobs', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/jobs"
      });
      toast({
        title: "Job added",
        description: "The job has been added to your tracker",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to add job: ${error.message}`,
        variant: "destructive",
      });
    }
  });
  
  // Get saved jobs only
  const savedJobs = jobs.filter(job => job.status === 'saved');
  
  // Get applied jobs only
  const appliedJobs = jobs.filter(job => job.status === 'applied');
  
  return {
    jobs,
    savedJobs,
    appliedJobs,
    isLoading,
    error,
    isError,
    refetch,
    updateJob: updateJobMutation.mutate,
    createJob: createJobMutation.mutate
  };
}