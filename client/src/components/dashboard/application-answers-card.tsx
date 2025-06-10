import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export default function ApplicationAnswersCard() {
  const [open, setOpen] = useState(false);
  
  const { data: answers, isLoading } = useQuery<any[]>({
    queryKey: ["/api/application-answers"],
  });

  // Group answers by category
  const requiredAnswers = (answers || []).filter((answer: any) => answer.category === "required");
  const demographicAnswers = (answers || []).filter((answer: any) => answer.category === "demographic");
  
  // For the card preview, show a subset of important answers
  const previewAnswers = [
    { label: "Work Authorization", key: "Are you authorized to work in the U.S.?" },
    { label: "Time Zone", key: "What time zone are you located in?" },
    { label: "Education", key: "What's your highest education level?" },
    { label: "Experience", key: "How many years of experience do you have?" },
    { label: "Last Job", key: "Last job title" },
  ];

  const findAnswer = (questionText: string) => {
    return (answers || []).find((answer: any) => answer.questionText === questionText)?.answer || "Not provided";
  };

  // Format the "Last job title" and "Last company" into a single line
  const getLastJob = () => {
    const title = findAnswer("Last job title");
    const company = findAnswer("Last company");
    
    if (title === "Not provided" && company === "Not provided") {
      return "Not provided";
    }
    
    return `${title} at ${company}`;
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg">Application Answers</CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Pencil className="h-4 w-4 mr-1" />
                View All
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Application Answers</DialogTitle>
                <DialogDescription>
                  These are the answers you've provided for common job application questions.
                </DialogDescription>
              </DialogHeader>
              
              <div className="mt-4">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="required">
                    <AccordionTrigger>Required Information</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {requiredAnswers.map((answer: any) => (
                          <div key={answer.id} className="flex flex-col space-y-1 py-2 border-b border-border last:border-0">
                            <span className="text-sm font-medium text-foreground">{answer.questionText}</span>
                            <span className="text-sm text-muted-foreground">{answer.answer}</span>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="demographic">
                    <AccordionTrigger>Demographic Information (Optional)</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        {demographicAnswers.length > 0 ? (
                          demographicAnswers.map((answer: any) => (
                            <div key={answer.id} className="flex flex-col space-y-1 py-2 border-b border-border last:border-0">
                              <span className="text-sm font-medium text-foreground">{answer.questionText}</span>
                              <span className="text-sm text-muted-foreground">{answer.answer}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground">No demographic information provided.</div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Work Authorization:</dt>
                <dd className="text-foreground">{findAnswer("Are you authorized to work in the U.S.?") === "yes" ? "Yes" : "No"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Time Zone:</dt>
                <dd className="text-foreground">{findAnswer("What time zone are you located in?")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Education:</dt>
                <dd className="text-foreground">{findAnswer("What's your highest education level?")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Experience:</dt>
                <dd className="text-foreground">{findAnswer("How many years of experience do you have?")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last Job:</dt>
                <dd className="text-foreground">{getLastJob()}</dd>
              </div>
            </dl>
          )}
        </CardContent>
        <CardFooter className="bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          {isLoading ? (
            <Skeleton className="h-4 w-3/4" />
          ) : (
            <div>
              <span className="font-medium text-foreground">{requiredAnswers.length}</span> required answers and{" "}
              <span className="font-medium text-foreground">{demographicAnswers.length}</span> optional answers saved
            </div>
          )}
        </CardFooter>
      </Card>
    </>
  );
}
