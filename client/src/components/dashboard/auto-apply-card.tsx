import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Check,
  AlertCircle,
  Clock,
  PlayCircle,
  RefreshCw,
  StopCircle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { debounce } from "lodash";

interface AutoApplyStatus {
  currentStatus: string;
  isAutoApplyEnabled: boolean;
  isInStandbyMode: boolean;
  queuedJobs: number;
  standbyJobs: number;
  completedJobs: number;
  failedJobs: number;
  latestMessage?: string;
  appliedToday: number;
  totalLimit: number;
  remaining: number;
  nextReset: string;
  logs?: AutoApplyLog[];
  hasMoreLogs?: boolean;
}

interface AutoApplyLog {
  id: number;
  userId: number;
  jobId: number | null;
  status: string;
  message: string;
  timestamp: string;
}

export default function AutoApplyCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [polling, setPolling] = useState(false);

  // Debounce query invalidation to prevent rapid calls
  const debouncedInvalidate = debounce(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/auto-apply/status"] });
  }, 1000);

  // Query to get the auto-apply status
  const {
    data: status,
    isLoading,
    error,
  } = useQuery<AutoApplyStatus>({
    queryKey: ["/api/auto-apply/status"],
    refetchOnWindowFocus: true,
    refetchInterval: polling ? 5000 : false,
    enabled: !!user,
    staleTime: 1000, // Prevent rapid refetching during re-renders
  });

  // Mutation to start the auto-apply process
  const startAutoApplyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auto-apply/start");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Auto-apply started",
        description: "We're now applying to jobs for you in the background.",
      });
      debouncedInvalidate();
      setPolling(true);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start auto-apply",
        description:
          error.message ||
          "An error occurred while starting the auto-apply process.",
        variant: "destructive",
      });
    },
  });

  // Mutation to stop the auto-apply process
  const stopAutoApplyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auto-apply/stop");
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Auto-apply stopped",
        description: "The auto-apply process has been stopped.",
      });
      debouncedInvalidate();
      setPolling(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to stop auto-apply",
        description:
          error.message ||
          "An error occurred while stopping the auto-apply process.",
        variant: "destructive",
      });
    },
  });

  // Check if the process is still running and manage polling
  useEffect(() => {
    if (status) {
      // Only update polling if it differs to prevent infinite loop
      if (polling !== status.isAutoApplyEnabled) {
        setPolling(status.isAutoApplyEnabled);
      }
    }
  }, [status]); // Removed toast from dependencies

  const handleStartAutoApply = () => {
    startAutoApplyMutation.mutate();
  };

  const handleStopAutoApply = () => {
    stopAutoApplyMutation.mutate();
  };

  // Show loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto-Apply</CardTitle>
          <CardDescription>Let AI apply to jobs for you</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (error || !status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Auto-Apply</CardTitle>
          <CardDescription>Let AI apply to jobs for you</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error instanceof Error
                ? error.message
                : "Failed to load auto-apply status."}
            </AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ["/api/auto-apply/status"],
              })
            }
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Show toast for completion (moved from useEffect to onSuccess)
  if (status.currentStatus === "Completed" && !status.isAutoApplyEnabled) {
    toast({
      title: "Auto-apply completed",
      description: status.latestMessage,
    });
  }

  // Get the appropriate status badge color
  const getStatusBadgeVariant = (
    status: string
  ): "default" | "destructive" | "secondary" | "outline" => {
    switch (status) {
      case "Started":
      case "Searching":
      case "Processing":
      case "Evaluating":
      case "In Progress":
        return "default";
      case "Applied":
      case "Completed":
        return "outline";
      case "Skipped":
      case "Standby":
        return "secondary";
      case "Failed":
      case "Error":
        return "destructive";
      default:
        return "outline";
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Auto-Apply</CardTitle>
            <CardDescription>Let AI apply to jobs for you</CardDescription>
          </div>
          <Badge variant={getStatusBadgeVariant(status.currentStatus)}>
            {status.currentStatus === "Not Started"
              ? "Ready"
              : status.currentStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Current progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Applications today</span>
            <span className="font-medium">
              {status.appliedToday}/{status.totalLimit || 100}
            </span>
          </div>
          <Progress
            value={Math.min(
              100,
              (status.appliedToday / (status.totalLimit || 100)) * 100
            )}
            className="h-2"
          />
          <p className="text-sm text-muted-foreground mt-1">
            {status.appliedToday > (status.totalLimit || 100) ? (
              <span className="text-destructive">
                -{Math.abs(status.remaining)} applications over limit
              </span>
            ) : (
              `${status.remaining} applications remaining today`
            )}
            {status.standbyJobs > 0 && status.isInStandbyMode && (
              <>
                {" "}
                •{" "}
                <span className="text-amber-500">
                  {status.standbyJobs} jobs in standby
                </span>
              </>
            )}
          </p>
        </div>

        {/* Latest status */}
        <Alert
          className={
            status.currentStatus === "Error" ||
            status.currentStatus === "Failed"
              ? "border-destructive"
              : status.currentStatus === "Completed"
              ? "border-green-500"
              : status.currentStatus === "Standby"
              ? "border-amber-500"
              : ""
          }
        >
          {status.currentStatus === "Error" ||
          status.currentStatus === "Failed" ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : status.currentStatus === "Started" ||
            status.currentStatus === "Searching" ||
            status.currentStatus === "Processing" ||
            status.currentStatus === "Evaluating" ||
            status.currentStatus === "In Progress" ? (
            <Clock className="h-4 w-4 animate-pulse" />
          ) : status.currentStatus === "Standby" ? (
            <Clock className="h-4 w-4 text-amber-500" />
          ) : (
            <Check className="h-4 w-4 text-green-500" />
          )}
          <AlertTitle>
            {status.currentStatus === "Error" ||
            status.currentStatus === "Failed"
              ? "Error"
              : status.currentStatus === "Started" ||
                status.currentStatus === "Searching" ||
                status.currentStatus === "Processing" ||
                status.currentStatus === "Evaluating" ||
                status.currentStatus === "In Progress"
              ? "In Progress"
              : status.currentStatus === "Standby"
              ? "Standby Mode Active"
              : "Status"}
          </AlertTitle>
          <AlertDescription>
            {status.latestMessage ||
              (status.isInStandbyMode
                ? `${status.standbyJobs} jobs are in standby due to daily limit. They will automatically resume at midnight.`
                : "Ready to apply to jobs.")}
          </AlertDescription>
        </Alert>

        {/* Recent activity logs */}
        {status.logs && status.logs.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2">Recent Activity</h3>
            <div className="max-h-40 overflow-y-auto space-y-2 pr-2">
              {status.logs.map((log) => (
                <div
                  key={log.id}
                  className="text-sm border-l-2 pl-3 py-1 border-muted-foreground/30"
                >
                  <p className="flex items-center gap-1">
                    <Badge
                      variant={getStatusBadgeVariant(log.status)}
                      className="text-xs px-1 py-0"
                    >
                      {log.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </p>
                  <p className="mt-1">{log.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex gap-2">
        {status.isAutoApplyEnabled ? (
          <Button
            onClick={handleStopAutoApply}
            disabled={stopAutoApplyMutation.isPending}
            variant="destructive"
            className="w-full"
          >
            {stopAutoApplyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Stopping...
              </>
            ) : (
              <>
                <StopCircle className="mr-2 h-4 w-4" />
                Stop Auto-Apply
              </>
            )}
          </Button>
        ) : (
          <Button
            onClick={handleStartAutoApply}
            disabled={startAutoApplyMutation.isPending || status.remaining <= 0}
            className="w-full"
          >
            {startAutoApplyMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : status.remaining <= 0 ? (
              status.isInStandbyMode ? (
                "Jobs in Standby (Limit Reached)"
              ) : (
                "Daily Limit Reached"
              )
            ) : (
              <>
                <PlayCircle className="mr-2 h-4 w-4" />
                Start Auto-Apply
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
