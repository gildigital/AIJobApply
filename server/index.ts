import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { registerApiTestRoute } from "./routes/api-test-route";
import { registerPlaywrightTestRoutes } from "./routes/playwright-test-routes";
import { registerEnvTestRoutes } from "./routes/env-test-routes";
import { registerDirectFetchTestRoutes } from "./routes/direct-fetch-test-routes";
import { registerWorkableDirectFetch } from "./routes/workable-direct-fetch";
import { registerWorkableTestRoutes } from "./routes/workable-test-routes";
import { registerDiagnosticsRoutes } from "./routes/diagnostics-routes";

const app = express();

// Create a raw body parser for Stripe webhook requests
const rawBodyParser = express.raw({type: 'application/json'});

// Special handling for the webhook route to get the raw body
app.use('/api/webhook', rawBodyParser);

// Standard body parser for all other routes
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhook') {
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
  if (process.env.NODE_ENV === 'development') {
    registerDiagnosticsRoutes(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = 5000;
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
