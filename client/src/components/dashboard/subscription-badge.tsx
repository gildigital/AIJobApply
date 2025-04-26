import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CrownIcon } from "lucide-react";

export function SubscriptionBadge() {
  const { user } = useAuth();
  
  if (!user || !user.subscriptionPlan || user.subscriptionPlan === "FREE") {
    return null;
  }
  
  // Determine badge appearance based on subscription plan
  const getBadgeAppearance = () => {
    switch (user.subscriptionPlan) {
      case "two_weeks":
        return {
          color: "bg-gradient-to-r from-blue-500 to-cyan-500",
          text: "2 Weeks",
          icon: false
        };
      case "one_month_silver":
        return {
          color: "bg-gradient-to-r from-slate-400 to-slate-500",
          text: "Silver",
          icon: false
        };
      case "one_month_gold":
        return {
          color: "bg-gradient-to-r from-amber-400 to-yellow-500",
          text: "Gold",
          icon: true
        };
      case "three_months_gold":
        return {
          color: "bg-gradient-to-r from-amber-400 to-yellow-500",
          text: "Gold (3 Months)",
          icon: true
        };
      default:
        return {
          color: "bg-gradient-to-r from-emerald-500 to-teal-600",
          text: "Premium",
          icon: false
        };
    }
  };
  
  const appearance = getBadgeAppearance();
  const expiryDate = user.subscriptionEndDate ? new Date(user.subscriptionEndDate) : null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            className={`${appearance.color} text-white font-medium px-3 py-1 h-7`}
            variant="outline"
          >
            {appearance.icon && <CrownIcon className="h-3.5 w-3.5 mr-1 text-yellow-100" />}
            {appearance.text}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">
            {expiryDate 
              ? `Your subscription is active until ${formatDate(expiryDate)}`
              : "Your subscription is active"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}