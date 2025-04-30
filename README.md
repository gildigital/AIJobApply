# AIJobApply

**AIJobApply** is an AI-driven platform that automates the job application process — from job discovery to intelligent application submission.  
Built to save users hours of manual job hunting and applying, AIJobApply uses real-time scraping, resume matching, and automated workflows to maximize efficiency.

---

## 🚀 Features

- **Automated Job Discovery:**  
  Scrapes Workable-hosted jobs and identifies opportunities matching user profiles.
  
- **AI Resume-to-Job Matching:**  
  Scores user resumes against job descriptions to prioritize the best-fit roles.

- **Auto-Apply Engine:**  
  Intelligent Playwright workers fill out and submit applications automatically.

- **Background Job Queue System:**  
  Real-time application queuing with subscription-based priority handling.

- **User Dashboard:**  
  Tracks application statuses, queue progress, and personalized metrics.

- **Subscription Tiers:**  
  Free and paid plans offering different queue speeds and application caps.

---

## 🛠️ Tech Stack

### 🧩 Frontend
- **React** with **TypeScript** for component-driven UI
- **Vite** for fast development and bundling
- **TailwindCSS** + **shadcn/ui** for modern styling and accessible components
- **TanStack React Query** for efficient client-side data fetching and caching
- **Wouter** for lightweight routing
- **React Hook Form** + **Zod** for robust form handling and validation
- **Recharts** for dynamic data visualization

### ⚙️ Backend
- **Node.js** with **Express** and **TypeScript**
- **PostgreSQL** hosted on **Neon (serverless)**
- **Drizzle ORM** for type-safe SQL queries
- **Passport.js** + **Express-Session** for secure, session-based authentication

### 🤖 AI & Automation
- **Playwright** for headless browser automation and form introspection
- **OpenAI API** for contextual cover letter and summary generation
- **Anthropic Claude API** for long-form and complex prompt handling
- **Schema-aware job processor** for dynamic form completion

### 🏗️ Architecture
- **Server-Sent Events (SSE)** for real-time job application progress updates
- **Background workers** for asynchronous job submission and retry logic
- **Tiered subscription model** with dynamic **rate limiting**

### 🚀 DevOps & Infrastructure
- **Railway** for deployment of backend services and Playwright workers
- **Neon** for scalable serverless PostgreSQL hosting
- **Stripe** for subscription billing and payment processing

---

## 📦 Installation

```bash
git clone git@github.com:gildigital/AIJobApply.git
cd AIJobApply
npm install
```

### Run development servers

```bash
npm run dev   # Starts frontend + backend
```

---

## 📈 Roadmap

- [x] Phase 1: Job API Integration (Adzuna, Workable scraping)
- [x] Phase 2: Resume parsing and matching
- [x] Phase 3: Application form introspection
- [x] Phase 4: Background auto-apply queue system
- [x] Phase 5: Queue status dashboard and real-time updates
- [ ] Phase 6: Intelligent retry/resume system
- [ ] Phase 7: Advanced analytics and success tracking
- [ ] Phase 8: Expand to other ATS platforms (Greenhouse, Lever, etc.)

---

## 🤝 Contributing

Contributions are welcome!  
Open an issue or submit a pull request to help improve AIJobApply.

---

## Code Changes

Perform changes in your environment and commit your changes with a style like this:

```
# -------50--------character--------heading------
Add change to class

# Followed by an empty line then the body
## What changed and why?
- Fixed logic because...

## How was the change tested?
- Output was verified...
```
  
Then push your change!

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

**Built with passion and too much coffee by [@gildigital](https://github.com/gildigital).**
