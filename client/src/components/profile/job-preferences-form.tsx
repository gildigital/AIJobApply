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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { jobPreferencesSchema } from "@shared/schema";
import { useProfile } from "@/hooks/use-profile";
import { Loader2 } from "lucide-react";
import { TagInput } from "@/components/ui/tag-input";
import { LocationTagInput } from "@/components/ui/location-tag-input";
import { Slider } from "@/components/ui/slider";

// Create a form schema based on the job preferences schema
const formSchema = jobPreferencesSchema.extend({});

// Job types
const jobTypes = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
];

// Experience levels
const experienceLevels = [
  { value: "entry_level", label: "Entry Level" },
  { value: "associate", label: "Associate" },
  { value: "mid_senior_level", label: "Mid-Senior Level" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
];

// Workplace types
const workplaceTypes = [
  { value: "on-site", label: "On-site" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
];

export function JobPreferencesForm() {
  const { profile, isLoading, isUpdating, updateJobPreferences, updateMatchThreshold } = useProfile();

  // Initialize form with the profile data
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobTitlesOfInterest: profile?.jobTitlesOfInterest || [],
      locationsOfInterest: profile?.locationsOfInterest || [],
      minSalaryExpectation: profile?.minSalaryExpectation || undefined,
      excludedCompanies: profile?.excludedCompanies || [],
      willingToRelocate: profile?.willingToRelocate || false,
      // Convert string to array if needed for backward compatibility
      preferredWorkArrangement: (Array.isArray(profile?.preferredWorkArrangement) 
        ? profile?.preferredWorkArrangement 
        : profile?.preferredWorkArrangement ? [profile?.preferredWorkArrangement] : ["full-time"]) as ("full-time" | "part-time" | "contract" | "temporary" | "internship")[],
      // Default to all workplace types if not set
      workplaceOfInterest: (profile?.workplaceOfInterest || ["remote", "hybrid", "on-site"]) as ("remote" | "hybrid" | "on-site")[],
      // Default to all experience levels if not set
      jobExperienceLevel: (profile?.jobExperienceLevel || ["entry_level", "associate", "mid_senior_level"]) as ("entry_level" | "associate" | "mid_senior_level" | "director" | "executive")[],
      activeSecurityClearance: profile?.activeSecurityClearance || false,
      clearanceDetails: profile?.clearanceDetails || "",
      matchScoreThreshold: profile?.matchScoreThreshold || 70,
    },
  });

  // Update the form when the profile data is loaded
  React.useEffect(() => {
    if (profile) {
      form.reset({
        jobTitlesOfInterest: profile.jobTitlesOfInterest || [],
        locationsOfInterest: profile.locationsOfInterest || [],
        minSalaryExpectation: profile.minSalaryExpectation || undefined,
        excludedCompanies: profile.excludedCompanies || [],
        willingToRelocate: profile.willingToRelocate || false,
        // Convert string to array if needed for backward compatibility
        preferredWorkArrangement: (Array.isArray(profile.preferredWorkArrangement) 
          ? profile.preferredWorkArrangement 
          : profile.preferredWorkArrangement ? [profile.preferredWorkArrangement as any] : ["full-time"]) as ("full-time" | "part-time" | "contract" | "temporary" | "internship")[],
        // Default to all workplace types if not set
        workplaceOfInterest: (profile.workplaceOfInterest || ["remote", "hybrid", "on-site"]) as ("remote" | "hybrid" | "on-site")[],
        // Default to all experience levels if not set
        jobExperienceLevel: (profile.jobExperienceLevel || ["entry_level", "associate", "mid_senior_level"]) as ("entry_level" | "associate" | "mid_senior_level" | "director" | "executive")[],
        activeSecurityClearance: profile.activeSecurityClearance || false,
        clearanceDetails: profile.clearanceDetails || "",
        matchScoreThreshold: profile.matchScoreThreshold || 70,
      });
    }
  }, [profile, form]);

  function onSubmit(values: z.infer<typeof formSchema>) {
    updateJobPreferences(values);
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Job Preferences</CardTitle>
          <CardDescription>Loading your job preferences...</CardDescription>
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
        <CardTitle>Job Preferences</CardTitle>
        <CardDescription>
          Customize your job preferences to find the perfect match
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="jobTitlesOfInterest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desired Job Titles</FormLabel>
                  <FormControl>
                    <TagInput
                      placeholder="Type a job title and press Enter..."
                      value={field.value || []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Type a job title and press Enter or comma to add it
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="preferredWorkArrangement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Employment Type</FormLabel>
                  <FormDescription>
                    Select the types of employment you're interested in (optional - if none selected, we'll search all types)
                  </FormDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { value: "full-time", label: "Full-time" },
                      { value: "part-time", label: "Part-time" },
                      { value: "contract", label: "Contract" },
                      { value: "temporary", label: "Temporary" },
                      { value: "internship", label: "Internship" }
                    ].map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`employment-${option.value}`}
                          checked={field.value?.includes(option.value as any)}
                          onCheckedChange={(checked) => {
                            const currentValues = field.value || [];
                            if (checked) {
                              field.onChange([...currentValues, option.value] as any);
                            } else {
                              field.onChange(
                                currentValues.filter((value) => value !== option.value) as any
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor={`employment-${option.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="workplaceOfInterest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workplace Type</FormLabel>
                  <FormDescription>
                    Select the workplace arrangements you prefer (optional - if none selected, we'll search all workplace types)
                  </FormDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { value: "remote", label: "Remote" },
                      { value: "hybrid", label: "Hybrid" },
                      { value: "on-site", label: "On-site" }
                    ].map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`workplace-${option.value}`}
                          checked={field.value?.includes(option.value as any)}
                          onCheckedChange={(checked) => {
                            const currentValues = field.value || [];
                            if (checked) {
                              field.onChange([...currentValues, option.value] as any);
                            } else {
                              field.onChange(
                                currentValues.filter((value) => value !== option.value) as any
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor={`workplace-${option.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="jobExperienceLevel"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Experience Level</FormLabel>
                  <FormDescription>
                    Select the experience levels you're targeting (optional - if none selected, we'll search all experience levels)
                  </FormDescription>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {[
                      { value: "entry_level", label: "Entry Level" },
                      { value: "associate", label: "Associate" },
                      { value: "mid_senior_level", label: "Mid-Senior Level" },
                      { value: "director", label: "Director" },
                      { value: "executive", label: "Executive" }
                    ].map((option) => (
                      <div key={option.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`experience-${option.value}`}
                          checked={field.value?.includes(option.value as any)}
                          onCheckedChange={(checked) => {
                            const currentValues = field.value || [];
                            if (checked) {
                              field.onChange([...currentValues, option.value] as any);
                            } else {
                              field.onChange(
                                currentValues.filter((value) => value !== option.value) as any
                              );
                            }
                          }}
                        />
                        <label
                          htmlFor={`experience-${option.value}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          {option.label}
                        </label>
                      </div>
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="locationsOfInterest"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Desired Locations</FormLabel>
                  <FormControl>
                    <LocationTagInput
                      placeholder="Type a location (e.g., San Diego, CA) and press Enter..."
                      value={field.value || []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Type a location (city, state format) and press Enter to add it (optional - if none selected, we'll search all locations)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="minSalaryExpectation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Salary Expectation</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="50000"
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : undefined;
                          field.onChange(value);
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      Annual salary in USD (e.g., 50000 for $50,000)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="willingToRelocate"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-end space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="willing-to-relocate"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel htmlFor="willing-to-relocate">Willing to Relocate</FormLabel>
                      <FormDescription>
                        Check if you're open to relocating for the right opportunity
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="activeSecurityClearance"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-end space-x-2">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        id="active-security-clearance"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel htmlFor="active-security-clearance">Active Security Clearance</FormLabel>
                      <FormDescription>
                        Check if you currently have an active security clearance
                      </FormDescription>
                    </div>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="clearanceDetails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Clearance Details</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Top Secret, Secret, etc."
                        {...field}
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Specify your clearance level and details
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="excludedCompanies"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Excluded Companies</FormLabel>
                  <FormControl>
                    <TagInput
                      placeholder="Type a company name and press Enter..."
                      value={field.value || []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Type a company name and press Enter or comma to add it
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="matchScoreThreshold"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Match Score Threshold ({field.value}%)</FormLabel>
                  <FormControl>
                    <Slider
                      min={0}
                      max={100}
                      step={5}
                      value={[field.value]}
                      onValueChange={(value) => {
                        // Update the form field
                        field.onChange(value[0]);
                        // Make API call to update threshold immediately
                        updateMatchThreshold(value[0]);
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Jobs with match scores below this threshold will be skipped during auto-apply
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />


            <Button type="submit" className="w-full" disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : (
                "Save Job Preferences"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}