interface JobListing {
  jobTitle: string;
  company: string;
  description: string;
  applyUrl: string;
  externalJobId?: string;
}

/**
 * Mock job data for development and testing
 * In a production environment, this would be replaced with data from external APIs
 */
export const mockJobsData: JobListing[] = [
  {
    jobTitle: "Software Engineer",
    company: "TechCorp Inc.",
    description: "We are looking for a skilled Software Engineer to join our team. The ideal candidate will have experience with React, Node.js, and TypeScript.",
    applyUrl: "https://example.com/jobs/software-engineer",
    externalJobId: "TC-SE-001"
  },
  {
    jobTitle: "Frontend Developer",
    company: "WebDesign Solutions",
    description: "Join our creative team building beautiful and responsive web applications. Required skills: HTML, CSS, JavaScript, React.",
    applyUrl: "https://example.com/jobs/frontend-developer",
    externalJobId: "WDS-FD-023"
  },
  {
    jobTitle: "Full Stack Developer",
    company: "StartupX",
    description: "Exciting startup looking for a Full Stack Developer. You'll work with React, Node.js, and MongoDB to build our core product.",
    applyUrl: "https://example.com/jobs/fullstack-developer",
    externalJobId: "SX-FSD-107"
  },
  {
    jobTitle: "Backend Engineer",
    company: "DataSystems Corp",
    description: "Join our backend team working on high-performance API services. Required skills: Node.js, Express, PostgreSQL.",
    applyUrl: "https://example.com/jobs/backend-engineer",
    externalJobId: "DSC-BE-045"
  },
  {
    jobTitle: "DevOps Engineer",
    company: "CloudNative Solutions",
    description: "Help us build and maintain our cloud infrastructure. Experience with AWS, Docker, and Kubernetes is required.",
    applyUrl: "https://example.com/jobs/devops-engineer",
    externalJobId: "CNS-DO-072"
  },
  {
    jobTitle: "Mobile Developer",
    company: "AppFactory",
    description: "Looking for a talented Mobile Developer with experience in React Native or Flutter to join our mobile development team.",
    applyUrl: "https://example.com/jobs/mobile-developer",
    externalJobId: "AF-MD-033"
  },
  {
    jobTitle: "UI/UX Designer",
    company: "DesignPro",
    description: "Creative UI/UX Designer needed for designing user interfaces for web and mobile applications. Figma experience required.",
    applyUrl: "https://example.com/jobs/ui-ux-designer",
    externalJobId: "DP-UID-019"
  },
  {
    jobTitle: "Project Manager",
    company: "AgileTeam",
    description: "Experienced Project Manager needed to lead software development projects. Agile/Scrum experience required.",
    applyUrl: "https://example.com/jobs/project-manager",
    externalJobId: "AT-PM-051"
  },
  {
    jobTitle: "QA Engineer",
    company: "QualityFirst",
    description: "Join our QA team to ensure the quality of our software products. Experience with automated testing frameworks required.",
    applyUrl: "https://example.com/jobs/qa-engineer",
    externalJobId: "QF-QA-027"
  },
  {
    jobTitle: "Data Scientist",
    company: "DataInsights",
    description: "We're looking for a Data Scientist to help us extract insights from our data. Experience with Python, SQL, and ML frameworks required.",
    applyUrl: "https://example.com/jobs/data-scientist",
    externalJobId: "DI-DS-064"
  },
  {
    jobTitle: "AI Engineer",
    company: "AILabs",
    description: "AI Engineer needed to develop machine learning models and integrate them into our products. Experience with PyTorch or TensorFlow required.",
    applyUrl: "https://example.com/jobs/ai-engineer",
    externalJobId: "AIL-AIE-092"
  },
  {
    jobTitle: "Security Engineer",
    company: "SecureDefense",
    description: "Help us secure our applications and infrastructure. Experience with security assessment tools and best practices required.",
    applyUrl: "https://example.com/jobs/security-engineer",
    externalJobId: "SD-SE-038"
  },
  {
    jobTitle: "Product Manager",
    company: "ProductVision",
    description: "Product Manager needed to define product strategy and roadmap. Experience with software products required.",
    applyUrl: "https://example.com/jobs/product-manager",
    externalJobId: "PV-PM-075"
  },
  {
    jobTitle: "Technical Support Engineer",
    company: "SupportHero",
    description: "Join our technical support team to help our customers solve complex technical issues. Strong problem-solving skills required.",
    applyUrl: "https://example.com/jobs/technical-support",
    externalJobId: "SH-TSE-056"
  },
  {
    jobTitle: "Content Writer",
    company: "ContentCraft",
    description: "Looking for a Content Writer with experience in technical writing to create documentation, blog posts, and marketing materials.",
    applyUrl: "https://example.com/jobs/content-writer",
    externalJobId: "CC-CW-083"
  }
];