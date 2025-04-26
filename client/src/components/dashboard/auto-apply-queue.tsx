import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Play, RefreshCw, Check, Clock, XCircle, HelpCircle } from "lucide-react";
import { useQueueStatus } from "@/hooks/use-queue-status";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Define the Job type
interface Job {
  id: number;
  userId: number;
  jobTitle: string;
  company: string;
  status: string;
}

// Custom hook to get jobs
function useJobs() {
  const { data: jobs = [], isLoading, error } = useQuery<Job[]>({
    queryKey: ['/api/jobs'],
  });
  
  return {
    jobs,
    savedJobs: jobs.filter(job => job.status === 'saved'),
    appliedJobs: jobs.filter(job => job.status === 'applied'),
    isLoading,
    error
  };
}

export function AutoApplyQueueCard() {
  const { data, isLoading, error, counts, queuedJobDetails, enqueueMutation, refetch } = useQueueStatus();
  const { savedJobs, isLoading: isJobsLoading } = useJobs();
  const { toast } = useToast();
  const [nextApplyTimer, setNextApplyTimer] = useState<number | null>(null);

  // Start a timer simulation for the next apply event
  useEffect(() => {
    if ((counts.pending > 0 || counts.processing > 0) && counts.isWorkerRunning) {
      const timer = setTimeout(() => {
        if (nextApplyTimer === null || nextApplyTimer <= 0) {
          setNextApplyTimer(3);
        } else {
          setNextApplyTimer(nextApplyTimer - 1);
        }
      }, 1000);
      
      return () => clearTimeout(timer);
    } else {
      setNextApplyTimer(null);
    }
  }, [counts, nextApplyTimer]);
  
  // Handle start auto-apply
  const handleProcessQueue = () => {
    if (savedJobs.length === 0) {
      toast({
        title: "No saved jobs",
        description: "Please save some jobs first before starting auto-apply",
        variant: "destructive"
      });
      return;
    }
    
    // Get job IDs to enqueue (limit to 20 jobs or fewer)
    const jobIdsToEnqueue = savedJobs.slice(0, 20).map((job) => job.id);
    
    // Enqueue jobs
    enqueueMutation.mutate(jobIdsToEnqueue);
    
    toast({
      title: "Queue Processing Started",
      description: `${jobIdsToEnqueue.length} jobs have been added to the queue`,
    });
  };
  
  // Calculate progress percentage
  const progressPercentage = counts.dailyLimit > 0 
    ? Math.min(100, Math.round((counts.appliedToday / counts.dailyLimit) * 100)) 
    : 0;
  
  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-xl font-bold">Queue Status</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">This component lets you process saved jobs through the auto-apply queue</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <CardDescription className="ml-2">
              Monitor the job application processing queue
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            onClick={() => refetch()} 
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Daily Usage Progress */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Daily Usage</span>
            <span className="text-sm font-medium">
              {counts.appliedToday} / {counts.dailyLimit} jobs used today
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>
        
        {/* Queue Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <StatCard 
            title="Pending" 
            value={counts.pending} 
            icon={<Clock className="h-4 w-4 text-yellow-500" />}
            className="bg-yellow-50 dark:bg-yellow-950/30"
          />
          <StatCard 
            title="Processing" 
            value={counts.processing} 
            icon={<Loader2 className="h-4 w-4 text-blue-500 animate-spin" />}
            className="bg-blue-50 dark:bg-blue-950/30"
          />
          <StatCard 
            title="Completed" 
            value={counts.completed} 
            icon={<Check className="h-4 w-4 text-green-500" />}
            className="bg-green-50 dark:bg-green-950/30"
          />
          <StatCard 
            title="Failed" 
            value={counts.failed} 
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            className="bg-red-50 dark:bg-red-950/30"
          />
        </div>
        
        {/* Status Feed */}
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Recent Queue Activity</h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading queue status...</span>
              </div>
            ) : queuedJobDetails.length === 0 ? (
              <div className="text-sm text-center py-4 text-muted-foreground">
                No jobs in the processing queue
              </div>
            ) : (
              queuedJobDetails
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5)
                .map((item) => (
                  <QueueItemCard key={item.queueId} item={item} />
                ))
            )}
          </div>
        </div>
        
        {/* Next Apply Timer */}
        {nextApplyTimer !== null && (
          <div className="flex items-center justify-center space-x-2 py-2 border-t pt-4">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm">Next job processing in {nextApplyTimer}s...</span>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex-1">
                <Button 
                  className="w-full gap-2" 
                  onClick={handleProcessQueue}
                  disabled={enqueueMutation.isPending || counts.remaining <= 0 || isJobsLoading || savedJobs.length === 0}
                >
                  {enqueueMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {savedJobs.length === 0 
                    ? "No Saved Jobs" 
                    : counts.remaining <= 0 
                      ? "Daily Limit Reached" 
                      : "Process Queued Jobs"}
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">This will start processing saved jobs through the auto-apply system. Jobs must be in "saved" status to be processed.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardFooter>
    </Card>
  );
}

// Stat Card Component
interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  className?: string;
}

function StatCard({ title, value, icon, className }: StatCardProps) {
  return (
    <div className={cn("p-2 rounded-md flex flex-col items-center justify-center", className)}>
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <span className="text-2xl font-bold">{value}</span>
    </div>
  );
}

// Queue Item Card Component
interface QueueItemCardProps {
  item: {
    queueId: number;
    queueStatus: "pending" | "processing" | "completed" | "failed";
    job: {
      jobTitle: string;
      company: string;
    };
    error?: string | null;
  };
}

function QueueItemCard({ item }: QueueItemCardProps) {
  const statusConfig = {
    pending: { icon: <Clock className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", text: "Pending" },
    processing: { icon: <Loader2 className="h-4 w-4 animate-spin" />, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", text: "Processing" },
    completed: { icon: <Check className="h-4 w-4" />, color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", text: "Applied" },
    failed: { icon: <XCircle className="h-4 w-4" />, color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", text: "Failed" }
  };
  
  const config = statusConfig[item.queueStatus];
  
  return (
    <div className="flex items-center p-2 border rounded-lg bg-card shadow-sm">
      <Badge variant="outline" className={cn("mr-2 gap-1", config.color)}>
        {config.icon}
        <span className="text-xs">{config.text}</span>
      </Badge>
      <div className="flex-1 truncate">
        <p className="text-sm font-medium truncate">
          {item.job.jobTitle} – {item.job.company}
        </p>
        {item.error && item.queueStatus === "failed" && (
          <p className="text-xs text-red-600 dark:text-red-400 truncate">{item.error}</p>
        )}
      </div>
    </div>
  );
}