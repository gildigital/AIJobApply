import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

interface Step {
  id: number;
  name: string;
}

interface ProgressStepsProps {
  steps: Step[];
  currentStep: number;
}

export default function ProgressSteps({ steps, currentStep }: ProgressStepsProps) {
  return (
    <nav aria-label="Progress" className="mx-auto max-w-2xl">
      <ol role="list" className="flex items-center">
        {steps.map((step, stepIdx) => (
          <li 
            key={step.id} 
            className={cn(
              stepIdx !== steps.length - 1 ? "flex-1" : "",
              "relative"
            )}
          >
            {step.id < currentStep ? (
              // Completed step
              <>
                <div className="group flex items-center">
                  <span className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white">
                    <Check className="h-5 w-5" />
                  </span>
                  <span className="ml-4 min-w-0 flex-1">
                    <span className="text-sm font-medium text-primary">{step.name}</span>
                  </span>
                </div>
                {stepIdx !== steps.length - 1 && (
                  <div className="hidden sm:flex absolute left-1/2 -translate-y-1 top-5 h-0.5 w-full bg-primary" aria-hidden="true" />
                )}
              </>
            ) : step.id === currentStep ? (
              // Current step
              <>
                <div className="group flex items-center" aria-current="step">
                  <span className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-primary bg-primary text-white">
                    {step.id}
                  </span>
                  <span className="ml-4 min-w-0 flex-1">
                    <span className="text-sm font-medium text-primary">{step.name}</span>
                  </span>
                </div>
                {stepIdx !== steps.length - 1 && (
                  <div className="hidden sm:flex absolute left-1/2 -translate-y-1 top-5 h-0.5 w-full bg-gray-200" aria-hidden="true" />
                )}
              </>
            ) : (
              // Upcoming step
              <>
                <div className="group flex items-center">
                  <span className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-gray-300 bg-white text-gray-500">
                    {step.id}
                  </span>
                  <span className="ml-4 min-w-0 flex-1">
                    <span className="text-sm font-medium text-gray-500">{step.name}</span>
                  </span>
                </div>
                {stepIdx !== steps.length - 1 && (
                  <div className="hidden sm:flex absolute left-1/2 -translate-y-1 top-5 h-0.5 w-full bg-gray-200" aria-hidden="true" />
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
