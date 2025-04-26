import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function RefundPolicyPage() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <Link href="/pricing">
          <Button variant="ghost" className="mb-8 flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Pricing</span>
          </Button>
        </Link>

        <div className="mx-auto max-w-3xl">
          <h1 className="text-3xl font-bold mb-6">AIJobApply Refund Policy</h1>
          <h2 className="text-xl font-semibold mb-4">Our 15-Day Interview Guarantee</h2>
          
          <div className="prose prose-blue max-w-none dark:prose-invert">
            <p>
              At AIJobApply, we're committed to helping you succeed in your job search. 
              We're so confident in our AI-powered application system that we back it with our 15-Day Interview Guarantee.
            </p>

            <h3>What Our Guarantee Covers</h3>
            <p>
              If you don't receive at least one interview invitation within 15 days of active subscription use,
              you are eligible for a full refund of your subscription fee. This guarantee applies to all paid subscription plans.
            </p>

            <h3>Eligibility Requirements</h3>
            <p>To qualify for our refund guarantee, you must meet all of the following criteria:</p>
            <ul>
              <li>Complete your profile with accurate information and upload a professional resume</li>
              <li>Apply to at least 10 jobs (for the Two Weeks plan) or 20 jobs (for all other plans) using our platform within the guarantee period</li>
              <li>Apply only to positions for which you meet at least 70% of the listed qualifications</li>
              <li>Submit your refund request within 3 days after the end of the 15-day period</li>
            </ul>

            <h3>How to Request a Refund</h3>
            <p>If you meet all eligibility requirements and wish to request a refund:</p>
            <ol>
              <li>Log into your AIJobApply account</li>
              <li>Navigate to "Account Settings" → "Subscription"</li>
              <li>Click on "Request Refund" and complete the short form</li>
              <li>Our team will review your request within 3 business days</li>
            </ol>

            <h3>Refund Processing</h3>
            <p>
              Approved refunds will be processed to your original payment method within 5-7 business days.
              You will receive an email confirmation once your refund has been processed.
            </p>

            <h3>Exclusions</h3>
            <p>Our guarantee does not cover:</p>
            <ul>
              <li>Accounts with incomplete profiles or unprofessional resumes</li>
              <li>Applications to positions where you do not meet the minimum qualifications</li>
              <li>Failure to apply to the minimum number of positions</li>
              <li>Refund requests submitted after the 3-day post-guarantee window</li>
              <li>Cases where interview invitations were received but declined or missed</li>
            </ul>

            <h3>Cancellation Policy</h3>
            <p>
              You may cancel your subscription at any time. However, cancelling your subscription before the end of your billing period
              will result in the forfeiture of the Interview Guarantee for that period.
            </p>

            <h3>Contact Us</h3>
            <p>
              If you have any questions about our refund policy or need assistance with a refund request,
              please contact our support team at support@aijobapply.com.
            </p>

            <p className="mt-8 text-sm text-gray-500">
              This refund policy was last updated on April 23, 2025.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}