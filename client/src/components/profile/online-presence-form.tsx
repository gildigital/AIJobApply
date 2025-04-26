import React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { onlinePresenceSchema } from "@shared/schema";
import { useProfile } from "@/hooks/use-profile";
import { Loader2 } from "lucide-react";

// Create a form schema based on the online presence schema
const formSchema = onlinePresenceSchema.extend({});

export function OnlinePresenceForm() {
  const { profile, isLoading, isUpdating, updateOnlinePresence } = useProfile();

  // Initialize form with the profile data
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      linkedinUrl: profile?.linkedinUrl || "",
      githubUrl: profile?.githubUrl || "",
      portfolioUrl: profile?.portfolioUrl || "",
      twitterUrl: profile?.twitterUrl || "",
      personalWebsite: profile?.personalWebsite || "",
      blogUrl: profile?.blogUrl || "",
      youtubeUrl: profile?.youtubeUrl || "",
      otherUrls: profile?.otherUrls || "",
    },
  });

  // Update the form when the profile data is loaded
  React.useEffect(() => {
    if (profile) {
      form.reset({
        linkedinUrl: profile.linkedinUrl || "",
        githubUrl: profile.githubUrl || "",
        portfolioUrl: profile.portfolioUrl || "",
        twitterUrl: profile.twitterUrl || "",
        personalWebsite: profile.personalWebsite || "",
        blogUrl: profile.blogUrl || "",
        youtubeUrl: profile.youtubeUrl || "",
        otherUrls: profile.otherUrls || "",
      });
    }
  }, [profile, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateOnlinePresence(values);
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Online Presence</CardTitle>
          <CardDescription>Loading your online presence information...</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Online Presence</CardTitle>
        <CardDescription>
          Add links to your professional profiles and online presence
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="linkedinUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>LinkedIn Profile</FormLabel>
                    <FormControl>
                      <Input placeholder="https://linkedin.com/in/yourprofile" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="githubUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GitHub Profile</FormLabel>
                    <FormControl>
                      <Input placeholder="https://github.com/yourusername" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="portfolioUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Portfolio URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com/portfolio" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="personalWebsite"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personal Website</FormLabel>
                    <FormControl>
                      <Input placeholder="https://yourname.com" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="twitterUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twitter Profile</FormLabel>
                    <FormControl>
                      <Input placeholder="https://twitter.com/yourusername" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="blogUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Blog URL</FormLabel>
                    <FormControl>
                      <Input placeholder="https://yourblog.com" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="youtubeUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>YouTube Channel</FormLabel>
                    <FormControl>
                      <Input placeholder="https://youtube.com/c/yourchannel" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="otherUrls"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Other URLs</FormLabel>
                    <FormControl>
                      <Input placeholder="https://example.com, https://another.com" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormDescription>
                      Comma-separated list of other relevant URLs
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full" disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save Online Presence"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}