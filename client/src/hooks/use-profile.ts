import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ContactInfo, JobPreferences, OnlinePresence, UserProfile } from "@shared/schema";

// Hook for fetching and managing user profile data
export function useProfile() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get the complete profile
  const profileQuery = useQuery<UserProfile, Error>({
    queryKey: ['/api/profile'],
    retry: false,
  });

  // Get profile completeness percentage
  const completenessQuery = useQuery<{ completeness: number }, Error>({
    queryKey: ['/api/profile/completeness'],
    retry: false,
  });

  // Update the entire profile
  const updateProfileMutation = useMutation({
    mutationFn: async (profileData: Partial<UserProfile>) => {
      const res = await apiRequest("POST", "/api/profile", profileData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/completeness'] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update just contact information
  const updateContactMutation = useMutation({
    mutationFn: async (contactData: ContactInfo) => {
      const res = await apiRequest("PATCH", "/api/profile/contact", contactData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/completeness'] });
      toast({
        title: "Contact information updated",
        description: "Your contact information has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update just job preferences
  const updateJobPreferencesMutation = useMutation({
    mutationFn: async (preferencesData: JobPreferences) => {
      const res = await apiRequest("PATCH", "/api/profile/job-preferences", preferencesData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/completeness'] });
      toast({
        title: "Job preferences updated",
        description: "Your job preferences have been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update just online presence
  const updateOnlinePresenceMutation = useMutation({
    mutationFn: async (onlineData: OnlinePresence) => {
      const res = await apiRequest("PATCH", "/api/profile/online-presence", onlineData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/completeness'] });
      toast({
        title: "Online presence updated",
        description: "Your online presence information has been updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Update just match score threshold
  const updateMatchThresholdMutation = useMutation({
    mutationFn: async (threshold: number) => {
      const res = await apiRequest("PATCH", "/api/profile/match-threshold", { matchScoreThreshold: threshold });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
      toast({
        title: "Match threshold updated",
        description: `Your match score threshold has been set to ${data.matchScoreThreshold}%`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    profile: profileQuery.data,
    isLoading: profileQuery.isLoading,
    error: profileQuery.error,
    completeness: completenessQuery.data?.completeness || 0,
    updateProfile: updateProfileMutation.mutate,
    updateContact: updateContactMutation.mutate,
    updateJobPreferences: updateJobPreferencesMutation.mutate,
    updateOnlinePresence: updateOnlinePresenceMutation.mutate,
    updateMatchThreshold: updateMatchThresholdMutation.mutate,
    isUpdating: 
      updateProfileMutation.isPending || 
      updateContactMutation.isPending || 
      updateJobPreferencesMutation.isPending || 
      updateOnlinePresenceMutation.isPending ||
      updateMatchThresholdMutation.isPending
  };
}