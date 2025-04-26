import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TrashIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

export function ClearTestDataButton() {
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();
  
  // Refetch job data and auto-apply logs after clearing
  const { refetch: refetchJobs } = useQuery({ 
    queryKey: ["/api/jobs"], 
    enabled: false 
  });
  
  const { refetch: refetchAutoApplyStatus } = useQuery({
    queryKey: ["/api/auto-apply/status"],
    enabled: false
  });

  const handleClearTestData = async () => {
    if (isClearing) return;
    
    try {
      setIsClearing(true);
      
      const response = await apiRequest("POST", "/api/test/clear-data");
      const result = await response.json();
      
      toast({
        title: "Test data cleared",
        description: `Successfully removed ${result.deletedJobs} job entries and ${result.deletedLogs} activity logs.`,
      });
      
      // Refetch data to update UI
      await refetchJobs();
      await refetchAutoApplyStatus();
    } catch (error) {
      console.error("Error clearing test data:", error);
      toast({
        title: "Error",
        description: "Failed to clear test data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleClearTestData}
      disabled={isClearing}
      className="gap-2"
    >
      <TrashIcon className="h-4 w-4" />
      {isClearing ? "Clearing..." : "Clear Test Data"}
    </Button>
  );
}