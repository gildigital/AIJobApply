import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, User, LogOut, Home, LayoutDashboard, CreditCard, Search, Award } from "lucide-react";
import { ThemeToggle } from "@/lib/theme-provider";
import { SubscriptionBadge } from "@/components/dashboard/subscription-badge";

export default function Navbar() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <nav className="bg-white dark:bg-gray-950 shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/">
                <span className="text-primary font-bold text-xl cursor-pointer">
                  AIJobApply
                </span>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            
            {/* Not logged in */}
            {!user && (
              <div className="flex space-x-2">
                {location !== "/auth" && (
                  <>
                    <Link href="/auth">
                      <Button variant="outline">Log in</Button>
                    </Link>
                    <Link href="/auth?tab=register">
                      <Button>Sign up</Button>
                    </Link>
                  </>
                )}
              </div>
            )}

            {/* Logged in */}
            {user && (
              <div className="flex items-center space-x-4">
                <Link href={user.onboardingCompleted ? "/dashboard" : "/onboarding"}>
                  <Button variant="ghost">
                    {user.onboardingCompleted ? (
                      <>
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Dashboard
                      </>
                    ) : (
                      <>
                        <Home className="h-4 w-4 mr-2" /> 
                        Complete Profile
                      </>
                    )}
                  </Button>
                </Link>
                <div className="flex items-center space-x-2">
                  <SubscriptionBadge />
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="space-x-2">
                      <User className="h-4 w-4" />
                      <span>{user.name}</span>
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <Link href="/profile">
                      <DropdownMenuItem>
                        <User className="h-4 w-4 mr-2" />
                        Profile Settings
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/pricing">
                      <DropdownMenuItem>
                        <CreditCard className="h-4 w-4 mr-2" />
                        Subscription Plans
                      </DropdownMenuItem>
                    </Link>
                    
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Developer Tools</DropdownMenuLabel>
                    <Link href="/job-search-test">
                      <DropdownMenuItem>
                        <Search className="h-4 w-4 mr-2" />
                        Job Search Test
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/job-match-test">
                      <DropdownMenuItem>
                        <Award className="h-4 w-4 mr-2" />
                        AI Job Match Test
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/workable-test">
                      <DropdownMenuItem>
                        <Award className="h-4 w-4 mr-2" />
                        Workable Test
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/workable-schema-test">
                      <DropdownMenuItem>
                        <Award className="h-4 w-4 mr-2" />
                        Workable Schema Test
                      </DropdownMenuItem>
                    </Link>
                    
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
                      <LogOut className="h-4 w-4 mr-2" />
                      {logoutMutation.isPending ? "Logging out..." : "Logout"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
