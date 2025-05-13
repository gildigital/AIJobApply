import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes.js";
// import { setupVite, serveStatic, log } from "./vite.js";
import { log } from "./vite.js";
import { registerApiTestRoute } from "./routes/api-test-route.js";
import { registerPlaywrightTestRoutes } from "./routes/playwright-test-routes.js";
import { registerEnvTestRoutes } from "./routes/env-test-routes.js";
import { registerDirectFetchTestRoutes } from "./routes/direct-fetch-test-routes.js";
import { registerWorkableDirectFetch } from "./routes/workable-direct-fetch.js";
import { registerWorkableTestRoutes } from "./routes/workable-test-routes.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics-routes.js";

const app = express();

// Enable CORS for Vercel frontend
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    credentials: true,
  })
);

// Create a raw body parser for Stripe webhook requests
const rawBodyParser = express.raw({ type: "application/json" });

// Special handling for the webhook route to get the raw body
app.use("/api/webhook", rawBodyParser);

// Standard body parser for all other routes
app.use((req, res, next) => {
  if (req.originalUrl === "/api/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});

app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  // Register our special API test routes that should bypass Vite's catch-all
  registerApiTestRoute(app);
  registerPlaywrightTestRoutes(app);
  registerEnvTestRoutes(app);
  registerDirectFetchTestRoutes(app);
  registerWorkableDirectFetch(app);
  registerWorkableTestRoutes(app);

  // Register diagnostics routes for development
  if (process.env.NODE_ENV === "development") {
    registerDiagnosticsRoutes(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // // importantly only setup vite in development and after
  // // setting up all the other routes so the catch-all route
  // // doesn't interfere with the other routes
  // if (app.get("env") === "development") {
  //   await setupVite(app, server);
  // } else {
  //   serveStatic(app);
  // }

  // Use environment port or default to 5000
  // Railway will set PORT for us automatically
  const port = Number(process.env.PORT || 5000);
  // Listen on all interfaces (0.0.0.0) which is important for containers
  server.listen(port, "0.0.0.0", () => {
    log(`🚀 Server listening on port ${port}`);
  });
})();
