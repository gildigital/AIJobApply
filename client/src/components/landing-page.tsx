import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { 
  BrainCircuit, 
  FileSearch, 
  Bot, 
  Send, 
  Upload, 
  ListChecks, 
  CheckCircle2, 
  Sparkles,
  Zap,
  ClipboardEdit,
  EyeIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  const [, setLocation] = useLocation();

  const handleGetStarted = () => {
    setLocation("/auth");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-50 via-white to-sky-50 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 pt-24 pb-20 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          {/* Background decorations */}
          <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 opacity-40">
            <div className="absolute -top-24 -left-20 w-72 h-72 bg-indigo-300 dark:bg-indigo-900 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-2xl opacity-20 animate-blob"></div>
            <div className="absolute -bottom-24 -right-20 w-72 h-72 bg-blue-300 dark:bg-blue-900 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
            <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-sky-300 dark:bg-sky-900 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
          </div>

          <div className="lg:grid lg:grid-cols-12 lg:gap-8 relative z-10">
            <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-6 lg:text-left">
              <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 dark:text-white sm:text-5xl md:text-6xl">
                <span className="block">Answer once.</span>
                <span className="block bg-gradient-to-r from-indigo-500 to-sky-500 bg-clip-text text-transparent">Apply everywhere.</span>
              </h1>
              <p className="mt-3 text-base text-gray-600 dark:text-gray-300 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                Save time on job applications by answering common questions just once. Our AI-powered system automates applications, so you can focus on interviews, not filling forms.
              </p>
              <div className="mt-8 sm:max-w-lg sm:mx-auto sm:text-center lg:text-left lg:mx-0">
                <Button 
                  onClick={handleGetStarted} 
                  size="lg" 
                  className="w-full md:w-auto px-8 py-3 text-base font-medium bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200"
                >
                  Get Started
                </Button>
              </div>
            </div>
            <div className="mt-12 relative sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-6 lg:flex lg:items-center">
              <div className="relative mx-auto w-full rounded-lg shadow-xl lg:max-w-md perspective-1200">
                <div className="relative block w-full bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
                  {/* AI-Powered Job Application System Visualization */}
                  <div className="relative w-full h-[380px] bg-gradient-to-b from-slate-50 to-white dark:from-gray-900 dark:to-gray-800 p-4">
                    {/* 3-Phase Application System */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
                      <div className="w-full max-w-md">
                        {/* Phase 1: Introspection */}
                        <div className="flex items-center mb-8 relative">
                          <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shadow-md">
                            <FileSearch className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div className="ml-4 flex-1">
                            <div className="h-10 flex items-center">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">Phase 1: Introspection</div>
                            </div>
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 mt-1 text-sm text-gray-700 dark:text-gray-300 border border-indigo-100 dark:border-indigo-900/50">
                              Scan job postings to identify unique form fields and requirements
                            </div>
                          </div>
                        </div>

                        {/* Phase 2: AI Generation */}
                        <div className="flex items-center mb-8 relative">
                          <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shadow-md">
                            <BrainCircuit className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="ml-4 flex-1">
                            <div className="h-10 flex items-center">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">Phase 2: AI Generation</div>
                            </div>
                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mt-1 text-sm text-gray-700 dark:text-gray-300 border border-blue-100 dark:border-blue-900/50">
                              LLM creates personalized responses for all application questions
                            </div>
                          </div>
                        </div>

                        {/* Phase 3: Automated Submission */}
                        <div className="flex items-center relative">
                          <div className="w-12 h-12 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shadow-md">
                            <Send className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                          </div>
                          <div className="ml-4 flex-1">
                            <div className="h-10 flex items-center">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">Phase 3: Submission</div>
                            </div>
                            <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 mt-1 text-sm text-gray-700 dark:text-gray-300 border border-sky-100 dark:border-sky-900/50">
                              Automatically submit your perfectly crafted application
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* No connector lines in the diagram as per user request */}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Technology Section */}
      <section className="py-12 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">Advanced Technology</h2>
            <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-3xl">
              Powered by cutting-edge AI
            </p>
            <p className="mt-4 max-w-2xl text-xl text-gray-500 dark:text-gray-400 lg:mx-auto">
              Our platform leverages state-of-the-art language models and computer vision to automate your job applications
            </p>
          </div>

          <div className="mt-10 bg-indigo-50 dark:bg-gray-800 rounded-2xl overflow-hidden shadow-lg">
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-indigo-200 dark:divide-gray-700">
              <div className="px-6 py-8 flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                  <BrainCircuit className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Language AI Integration</h3>
                <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                  Our system uses advanced LLMs to craft personalized answers to application questions, including cover letters and personal statements.
                </p>
              </div>
              
              <div className="px-6 py-8 flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                  <EyeIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Computer Vision</h3>
                <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                  AI vision detects form elements and complex UI components that traditional automation misses, ensuring flawless submissions.
                </p>
              </div>
              
              <div className="px-6 py-8 flex flex-col items-center text-center">
                <div className="p-3 rounded-full bg-indigo-100 dark:bg-indigo-900/50">
                  <Bot className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">Intelligent Automation</h3>
                <p className="mt-2 text-base text-gray-500 dark:text-gray-400">
                  Our system adapts to each unique job application form, filling in the right information in the right places every time.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-base font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">Features</h2>
            <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl lg:text-3xl">
              How AIJobApply streamlines your job search
            </p>
          </div>

          <div className="mt-12">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-lg blur opacity-25 group-hover:opacity-70 transition duration-300"></div>
                <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 h-full overflow-hidden">
                  <div className="flex flex-col h-full">
                    <div className="p-3 rounded-full bg-indigo-100 dark:bg-indigo-900/50 w-14 h-14 flex items-center justify-center mb-4">
                      <ClipboardEdit className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Smart Form Filling</h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-4 flex-grow">
                      Our 3-phase system identifies form fields, generates perfect responses, and submits applications automatically.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Detects all form fields</span>
                      </li>
                      <li className="flex items-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">AI-generated custom responses</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-sky-500 rounded-lg blur opacity-25 group-hover:opacity-70 transition duration-300"></div>
                <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 h-full overflow-hidden">
                  <div className="flex flex-col h-full">
                    <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/50 w-14 h-14 flex items-center justify-center mb-4">
                      <Upload className="h-7 w-7 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Resume Management</h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-4 flex-grow">
                      Upload your resume once and our system will automatically submit it to every job application.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Secure cloud storage</span>
                      </li>
                      <li className="flex items-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Auto-format for ATS compatibility</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-sky-500 to-indigo-500 rounded-lg blur opacity-25 group-hover:opacity-70 transition duration-300"></div>
                <div className="relative bg-white dark:bg-gray-800 rounded-lg p-6 h-full overflow-hidden">
                  <div className="flex flex-col h-full">
                    <div className="p-3 rounded-full bg-sky-100 dark:bg-sky-900/50 w-14 h-14 flex items-center justify-center mb-4">
                      <ListChecks className="h-7 w-7 text-sky-600 dark:text-sky-400" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Application Tracking</h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-4 flex-grow">
                      Monitor all your applications in one dashboard, from submission to interview to offer.
                    </p>
                    <ul className="space-y-2">
                      <li className="flex items-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Real-time status updates</span>
                      </li>
                      <li className="flex items-center">
                        <CheckCircle2 className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                        <span className="text-sm text-gray-500 dark:text-gray-400">Comprehensive application history</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Steps Section */}
      <section className="py-16 bg-white dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-base font-semibold text-indigo-600 dark:text-indigo-400 tracking-wide uppercase">How It Works</h2>
            <p className="mt-2 text-3xl font-extrabold text-gray-900 dark:text-white sm:text-4xl">
              Three simple steps to automate your job search
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 max-w-5xl mx-auto">
            {/* Step 1 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="flex-shrink-0 flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xl font-bold shadow-lg mb-4">
                1
              </div>
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-3">Create Your Profile</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Sign up and fill out your profile with your professional information, including your resume, skills, and job preferences.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="flex-shrink-0 flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xl font-bold shadow-lg mb-4">
                2
              </div>
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-3">Select Jobs to Apply</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Browse job listings or paste a specific job URL. Our system will automatically analyze the job description and form.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative flex flex-col items-center text-center">
              <div className="flex-shrink-0 flex items-center justify-center h-16 w-16 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-xl font-bold shadow-lg mb-4">
                3
              </div>
              <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-3">Let AI Do the Work</h3>
              <p className="text-gray-600 dark:text-gray-300">
                Our three-phase system takes over: introspecting fields, generating tailored responses, and submitting your application automatically.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      {/* CTA Section */}
      <section className="bg-gradient-to-r from-indigo-600 to-blue-700 dark:from-indigo-800 dark:to-blue-900">
        <div className="max-w-4xl mx-auto text-center py-16 px-4 sm:py-20 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-white sm:text-4xl">
            <span className="block">Ready to transform your job search?</span>
          </h2>
          <p className="mt-4 text-lg leading-6 text-indigo-100">
            Join thousands of job seekers who are spending less time on applications and more time interviewing.
          </p>
          <Button 
            variant="secondary" 
            size="lg" 
            onClick={handleGetStarted} 
            className="mt-8 w-full inline-flex justify-center sm:w-auto bg-white text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700"
          >
            Get started for free
          </Button>
          <p className="mt-4 text-sm text-indigo-200">
            No credit card required. Start applying to jobs today.
          </p>
        </div>
      </section>

      {/* Custom classes are defined in index.css */}
    </div>
  );
}
