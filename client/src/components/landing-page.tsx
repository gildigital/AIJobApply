import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { ClipboardList, Upload, ListChecks } from "lucide-react";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    setLocation("/auth");
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary-50 to-primary-100 dark:from-gray-900 dark:to-gray-800 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
              <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
                <span className="block">Answer once.</span>
                <span className="block text-primary-600 dark:text-primary-400">Apply everywhere.</span>
              </h1>
              <p className="mt-3 text-base text-gray-500 dark:text-gray-300 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                Save time on job applications by answering common questions just once. Upload your resume, track your applications, and apply to jobs faster than ever.
              </p>
              <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
                <Button 
                  onClick={handleGetStarted} 
                  size="lg" 
                  className="w-full md:w-auto px-8 py-3 text-base"
                >
                  Get Started
                </Button>
              </div>
            </div>
            <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
              <div className="relative mx-auto w-full rounded-lg shadow-lg lg:max-w-md">
                <div className="relative block w-full bg-white dark:bg-gray-800 rounded-lg overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2">
                  <svg
                    className="w-full h-64"
                    viewBox="0 0 600 400"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect width="600" height="400" fill="#f5f7fa" className="dark:fill-gray-900" />
                    <path
                      d="M150,250 L450,250 M150,150 L450,150 M150,200 L450,200 M150,300 L300,300"
                      stroke="#4F46E5"
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray="12,24"
                    />
                    <circle cx="180" cy="80" r="40" fill="#C7D2FE" fillOpacity="0.8" />
                    <circle cx="420" cy="80" r="40" fill="#C7D2FE" fillOpacity="0.8" />
                    <circle cx="180" cy="350" r="40" fill="#C7D2FE" fillOpacity="0.8" />
                    <circle cx="420" cy="350" r="40" fill="#C7D2FE" fillOpacity="0.8" />
                    <path
                      d="M300,20 L300,380"
                      stroke="#4F46E5"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray="16,16"
                      strokeOpacity="0.7"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-medium text-gray-800 dark:text-gray-100">Simplify your job application process</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-primary-600 dark:text-primary-400 tracking-wide uppercase">Features</h2>
            <p className="mt-1 text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl sm:tracking-tight lg:text-4xl">
              How AIJobApply helps you land your next role
            </p>
          </div>

          <div className="mt-12">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="pt-6">
                <div className="flow-root bg-gray-50 dark:bg-gray-800 rounded-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-primary-500 rounded-md shadow-lg">
                        <ClipboardList className="h-6 w-6 text-white" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 dark:text-white tracking-tight">Answer Common Questions Once</h3>
                    <p className="mt-5 text-base text-gray-500 dark:text-gray-400">
                      Save all your standard application answers in one place and never type them again.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="pt-6">
                <div className="flow-root bg-gray-50 dark:bg-gray-800 rounded-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-primary-500 rounded-md shadow-lg">
                        <Upload className="h-6 w-6 text-white" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 dark:text-white tracking-tight">Upload Your Resume</h3>
                    <p className="mt-5 text-base text-gray-500 dark:text-gray-400">
                      Store your resume securely in our system for quick access when applying to jobs.
                    </p>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="pt-6">
                <div className="flow-root bg-gray-50 dark:bg-gray-800 rounded-lg px-6 pb-8">
                  <div className="-mt-6">
                    <div>
                      <span className="inline-flex items-center justify-center p-3 bg-primary-500 rounded-md shadow-lg">
                        <ListChecks className="h-6 w-6 text-white" />
                      </span>
                    </div>
                    <h3 className="mt-8 text-lg font-medium text-gray-900 dark:text-white tracking-tight">Track Your Applications</h3>
                    <p className="mt-5 text-base text-gray-500 dark:text-gray-400">
                      Keep track of all your job applications in one place, from applied to offer.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="bg-primary-700 dark:bg-primary-900">
        <div className="max-w-2xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">Ready to simplify your job search?</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-primary-100">
            Join thousands of job seekers who are spending less time on applications and more time interviewing.
          </p>
          <Button 
            variant="secondary" 
            size="lg" 
            onClick={handleGetStarted} 
            className="mt-8 w-full inline-flex justify-center sm:w-auto"
          >
            Get started for free
          </Button>
        </div>
      </section>
    </div>
  );
}
