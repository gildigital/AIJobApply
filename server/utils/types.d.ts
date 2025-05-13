import "express";

declare global {
  namespace Express {
    interface User {
      id: number;
      username: string;
      password: string;
      name: string;
      email: string;
      location: string | null;
      onboardingCompleted: boolean;
      resumeText: string | null;
      userSummary: string | null;
      subscriptionPlan: "FREE" | "two_weeks" | "one_month_silver" | "one_month_gold" | "three_months_gold";
      subscriptionStartDate: Date | null;
      subscriptionEndDate: Date | null;
      isAdmin: boolean;
      createdAt: Date;
      updatedAt: Date;
      isAutoApplyEnabled: boolean;
    }

    interface Request {
      user?: User;
    }
  }
}

declare module "pdf-parse" {
  interface PDFParseResult {
    text: string;
    info: any;
    metadata: any;
    version: string;
    numpages: number;
  }

  function parse(dataBuffer: Buffer, options?: any): Promise<PDFParseResult>;

  export = parse;
}
