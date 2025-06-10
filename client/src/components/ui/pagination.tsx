import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ currentPage, totalPages, onPageChange, className = "" }: PaginationProps) {
  if (totalPages <= 1) return null;

  // Simple and reliable page number generation
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    
    // If we have 7 or fewer pages, show them all
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
      return pages;
    }

    // Always show page 1
    pages.push(1);

    // Determine the range around current page
    let startPage = Math.max(2, currentPage - 1);
    let endPage = Math.min(totalPages - 1, currentPage + 1);

    // Adjust range if we're near the beginning
    if (currentPage <= 3) {
      startPage = 2;
      endPage = 4;
    }
    
    // Adjust range if we're near the end
    if (currentPage >= totalPages - 2) {
      startPage = totalPages - 3;
      endPage = totalPages - 1;
    }

    // Add ellipsis before start if needed
    if (startPage > 2) {
      pages.push("...");
    }

    // Add the middle pages
    for (let i = startPage; i <= endPage; i++) {
      if (i !== 1 && i !== totalPages) { // Avoid duplicating first and last
        pages.push(i);
      }
    }

    // Add ellipsis after end if needed
    if (endPage < totalPages - 1) {
      pages.push("...");
    }

    // Always show last page (if it's not page 1)
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className={`flex items-center justify-center space-x-1 ${className}`}>
      {/* Previous button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className="flex items-center"
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous page</span>
      </Button>

      {/* Page numbers */}
      <div className="flex items-center space-x-1">
        {pageNumbers.map((page, index) => {
          if (page === "...") {
            return (
              <span key={`ellipsis-${index}`} className="px-2 py-1 text-muted-foreground">
                ...
              </span>
            );
          }

          const pageNum = page as number;
          const isCurrentPage = pageNum === currentPage;

          return (
            <Button
              key={`page-${pageNum}`}
              variant={isCurrentPage ? "default" : "outline"}
              size="sm"
              onClick={() => onPageChange(pageNum)}
              className={isCurrentPage ? "bg-primary text-primary-foreground" : ""}
            >
              {pageNum}
            </Button>
          );
        })}
      </div>

      {/* Next button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="flex items-center"
      >
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next page</span>
      </Button>
    </div>
  );
}
