import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import ResumeCard from "@/components/dashboard/resume-card";
import ApplicationAnswersCard from "@/components/dashboard/application-answers-card";
import AddJobCard from "@/components/dashboard/add-job-card";
import JobTrackerTable from "@/components/dashboard/job-tracker-table";
import UserSummaryCard from "@/components/dashboard/user-summary-card";
import { PaymentSuccessBanner } from "@/components/dashboard/payment-success-banner";
import { SubscriptionManagement } from "@/components/dashboard/subscription-management";
import AutoApplyCard from "@/components/dashboard/auto-apply-card";
import { AutoApplyQueueCard } from "@/components/dashboard/auto-apply-queue";
import FindJobsCard from "@/components/dashboard/find-jobs-card";
import { ClearTestDataButton } from "@/components/dashboard/clear-test-data-button";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sparkles, Zap } from "lucide-react";
import { Link } from "wouter";

export default function DashboardPage() {
  const { user } = useAuth();
  
  if (!user) return null;

  const isPremium = user.subscriptionPlan && user.subscriptionPlan !== 'FREE';

  return (
    <div className="bg-gray-100 dark:bg-gray-900 min-h-[calc(100vh-4rem)]">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {/* Payment Success Banner */}
        <div className="px-4 sm:px-0">
          <PaymentSuccessBanner />
        </div>
        
        {/* Welcome Header */}
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Welcome, {user.name}!</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                You're ready to start applying for jobs. Use the tools below to streamline your job search.
              </p>
            </div>
            {!isPremium && (
              <Link href="/pricing">
                <Button className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-green-400 to-blue-600 px-8 py-6 text-white hover:from-green-500 hover:to-blue-700 h-14">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-full w-full scale-0 rounded-full bg-white opacity-20 transition-all duration-500 group-hover:scale-100 group-active:scale-100"></div>
                  </div>
                  <span className="relative flex items-center gap-1 text-lg font-medium">
                    <Sparkles className="h-5 w-5 text-yellow-300" /> Start Auto-Applying Now <Zap className="h-5 w-5 text-yellow-300" />
                  </span>
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* User Summary Card */}
        <div className="px-4 mb-4 sm:px-0">
          <UserSummaryCard />
        </div>
        
        {/* Subscription Management */}
        <div className="px-4 mb-4 sm:px-0">
          <SubscriptionManagement />
        </div>

        {/* Dashboard Content */}
        <div className="px-4 sm:px-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ResumeCard />
            <ApplicationAnswersCard />
            <div className="sm:col-span-2 lg:col-span-3">
              <AddJobCard />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <FindJobsCard />
            </div>
            {isPremium && (
              <>
                <div className="sm:col-span-2 lg:col-span-3">
                  <AutoApplyCard />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <AutoApplyQueueCard />
                </div>
              </>
            )}
          </div>

          {/* Job Tracker Table */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-medium text-gray-900 dark:text-white">Your Job Applications</h2>
              <ClearTestDataButton />
            </div>
            <JobTrackerTable />
          </div>
        </div>
      </div>
    </div>
  );
}
