import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, FileText, Rocket, UserCheck, Zap } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface UserSummaryData {
  resumeText: string;
  userSummary: string;
}

export default function UserSummaryCard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery<UserSummaryData>({
    queryKey: ['/api/user-summary'],
    retry: false
  });

  // Check if user has a premium subscription
  const isPremium = user?.subscriptionPlan && user.subscriptionPlan !== "FREE";

  if (isLoading) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <CardTitle>
            <Skeleton className="h-6 w-1/3" />
          </CardTitle>
          <CardDescription>
            <Skeleton className="h-4 w-1/2" />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !data || !data.userSummary) {
    return (
      <Card className="flex-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck size={20} /> Professional Summary
          </CardTitle>
          <CardDescription>Based on your resume analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <FileText className="mb-2 h-10 w-10" />
            <p className="mb-2">No summary generated yet</p>
            <p className="text-sm">Please upload your resume to generate a professional summary</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card className="flex-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <UserCheck size={20} className="text-green-600 dark:text-green-500" /> 
          Professional Summary
          <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <Check size={12} className="mr-1" /> AI-Generated
          </Badge>
        </CardTitle>
        <CardDescription>Based on resume analysis</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="rounded-md bg-muted/50 p-4 text-card-foreground">
          <p className="text-md font-medium italic leading-relaxed">"{data.userSummary}"</p>
        </div>
      </CardContent>
      <CardFooter className="pt-2">
        {!isPremium && (
          <Link href="/pricing">
            <Button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white" size="lg">
              <Rocket className="mr-2 h-5 w-5" />
              Start Auto-Applying to Jobs
            </Button>
          </Link>
        )}
        {isPremium && (
          <Button className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white" size="lg">
            <Zap className="mr-2 h-5 w-5" />
            Apply to Jobs Now
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}