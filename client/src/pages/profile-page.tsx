import React from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileCompleteness } from "@/components/profile/profile-completeness";
import { ContactInfoForm } from "@/components/profile/contact-info-form";
import { JobPreferencesForm } from "@/components/profile/job-preferences-form";
import { OnlinePresenceForm } from "@/components/profile/online-presence-form";
import { PortfolioManagement } from "@/components/profile/portfolio-management";
import { 
  User, 
  UserCircle, 
  Briefcase, 
  Globe, 
  FileText, 
  ArrowLeft 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function ProfilePage() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = React.useState("contact");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Link href="/">
              <Button variant="ghost" size="sm" className="flex items-center">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Profile Settings</h1>
          <div></div> {/* Empty div for flex alignment */}
        </div>

        <ProfileCompleteness />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="contact" className="flex items-center">
              <UserCircle className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Contact</span>
            </TabsTrigger>
            <TabsTrigger value="job-preferences" className="flex items-center">
              <Briefcase className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Job Preferences</span>
            </TabsTrigger>
            <TabsTrigger value="online-presence" className="flex items-center">
              <Globe className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Online Presence</span>
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Portfolio</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center">
              <User className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Account</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="contact">
              <ContactInfoForm />
            </TabsContent>

            <TabsContent value="job-preferences">
              <JobPreferencesForm />
            </TabsContent>

            <TabsContent value="online-presence">
              <OnlinePresenceForm />
            </TabsContent>

            <TabsContent value="portfolio">
              <PortfolioManagement />
            </TabsContent>

            <TabsContent value="account">
              <div className="rounded-lg border p-6 shadow-md">
                <h2 className="text-xl font-semibold mb-4">Account Management</h2>
                <p className="text-muted-foreground mb-4">
                  Coming soon! Account management features will allow you to update your username,
                  password, and other account settings.
                </p>
                <div className="flex space-x-4">
                  <Button variant="outline" disabled>
                    Change Password
                  </Button>
                  <Button variant="outline" disabled>
                    Delete Account
                  </Button>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}