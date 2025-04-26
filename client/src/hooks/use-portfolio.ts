import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Portfolio } from "@shared/schema";

export interface PortfolioWithoutData extends Omit<Portfolio, 'fileData'> {}

// Hook for fetching and managing user portfolio data
export function usePortfolio() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get all portfolios
  const portfoliosQuery = useQuery<PortfolioWithoutData[], Error>({
    queryKey: ['/api/profile/portfolios'],
    retry: false,
  });

  // Upload a new portfolio file
  const uploadPortfolioMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await apiRequest("POST", "/api/profile/portfolio", formData, {
        headers: {} // Remove Content-Type header so browser sets it with boundary for multipart/form-data
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/completeness'] });
      toast({
        title: "File uploaded",
        description: "Your portfolio file was uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete a portfolio file
  const deletePortfolioMutation = useMutation({
    mutationFn: async (portfolioId: number) => {
      const res = await apiRequest("DELETE", `/api/profile/portfolio/${portfolioId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/profile/portfolios'] });
      queryClient.invalidateQueries({ queryKey: ['/api/profile/completeness'] });
      toast({
        title: "File deleted",
        description: "Your portfolio file was deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    portfolios: portfoliosQuery.data || [],
    isLoading: portfoliosQuery.isLoading,
    error: portfoliosQuery.error,
    uploadPortfolio: uploadPortfolioMutation.mutate,
    deletePortfolio: deletePortfolioMutation.mutate,
    isUploading: uploadPortfolioMutation.isPending,
    isDeleting: deletePortfolioMutation.isPending
  };
}