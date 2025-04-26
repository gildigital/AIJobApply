import React from "react";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfile } from "@/hooks/use-profile";

export function ProfileCompleteness() {
  const { completeness, isLoading } = useProfile();
  
  // Determine color based on completeness
  const getProgressColorClass = () => {
    if (completeness < 30) return "bg-red-500";
    if (completeness < 70) return "bg-amber-500";
    return "bg-green-500";
  };

  return (
    <Card className="shadow-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Profile Completeness</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {isLoading ? "Loading..." : `${completeness}% Complete`}
            </span>
            <span className="text-xs font-medium">
              {completeness < 70 ? 
                "Complete your profile to improve job matches" : 
                "Great job! Your profile is well-completed"}
            </span>
          </div>
          <div className="relative w-full h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={`absolute left-0 top-0 h-full ${getProgressColorClass()}`} 
              style={{ width: `${completeness}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}