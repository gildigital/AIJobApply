// server/index.ts
import "dotenv/config";
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import { createServer, type Server as HttpServer } from "http";

// --- Local Module Imports ---
import { registerRoutes } from "./routes.js";

// Test route imports
import { registerApiTestRoute } from "./routes/api-test-route.js";
import { registerPlaywrightTestRoutes } from "./routes/playwright-test-routes.js";
import { registerEnvTestRoutes } from "./routes/env-test-routes.js";
import { registerDirectFetchTestRoutes } from "./routes/direct-fetch-test-routes.js";
import { registerWorkableDirectFetch } from "./routes/workable-direct-fetch.js";
import { registerWorkableTestRoutes } from "./routes/workable-test-routes.js";
import { registerDiagnosticsRoutes } from "./routes/diagnostics-routes.js";

const log = console.log; // Use standard console.log directly
const app: Express = express();

// --- CORS Configuration & Handling ---
const configuredOrigin = process.env.ALLOWED_ORIGIN;
log(
  `[CORS DEBUG] Value of process.env.ALLOWED_ORIGIN from Railway env: "${configuredOrigin}"`
);

const corsOriginToUse = configuredOrigin || "*"; // This should resolve to your Vercel URL
log(
  `[CORS DEBUG] Effective origin value being used for CORS: "${corsOriginToUse}"`
);

const corsOptionsForActualRequests = {
  origin: corsOriginToUse,
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE", // OPTIONS handled by app.options
  allowedHeaders: "Content-Type,Authorization,X-Requested-With", // Add any other headers your client sends
};

// Explicitly handle ALL preflight OPTIONS requests MANUALLY.
// This MUST come before any other routes or general middleware that might intercept OPTIONS.
app.options("*", (req: Request, res: Response) => {
  log(
    `[MANUAL OPTIONS HANDLER *] Path: ${req.path}, Request Origin: ${req.headers.origin}`
  );

  // Check if the request origin is the one we want to allow for credentialed requests
  if (req.headers.origin === corsOriginToUse) {
    res.setHeader("Access-Control-Allow-Origin", corsOriginToUse);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    ); // Match client headers
    res.setHeader("Access-Control-Max-Age", "86400"); // Optional: Cache preflight result for 1 day
    log(
      "[MANUAL OPTIONS HANDLER *] Origin matched. Sending 204 with manual CORS headers."
    );
    res.sendStatus(204); // Send 204 No Content and end response
  } else {
    // If origin doesn't match, or it's an OPTIONS request not from an allowed origin,
    // send a simple 204 without permissive CORS headers, or a 403.
    // Sending 204 is often sufficient for OPTIONS to just "pass through" without erroring,
    // but the browser will still block the subsequent actual request if its origin isn't allowed.
    log(
      `[MANUAL OPTIONS HANDLER *] Origin mismatch or no origin. Req Origin: ${req.headers.origin}. Sending 204.`
    );
    res.sendStatus(204);
  }
});

// Apply CORS middleware for actual requests (GET, POST, etc.) AFTER preflight is handled
app.use(cors(corsOptionsForActualRequests));

// --- Body Parsers (AFTER CORS, especially after manual OPTIONS handler) ---
const rawBodyParser = express.raw({ type: "application/json" });
app.use("/api/webhook", rawBodyParser);

app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl === "/api/webhook") {
    return next();
  }
  express.json()(req, res, next);
});
app.use(express.urlencoded({ extended: false }));

// --- Request Logger Middleware ---
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  // Only patch res.json if it's not an OPTIONS request already handled
  if (req.method !== "OPTIONS") {
    const originalResJson = res.json;
    res.json = function (this: Response, bodyJson: any) {
      // Correctly typed 'this'
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(this, arguments as any); // Use arguments
    };
  }

  res.on("finish", () => {
    // Don't log for OPTIONS requests handled by our manual handler, as they won't have a typical "finish" flow
    if (
      req.method === "OPTIONS" &&
      res.statusCode === 204 &&
      req.path === (req.route?.path || req.path)
    ) {
      // Already logged by MANUAL OPTIONS HANDLER if needed
      return;
    }

    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try {
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
        } catch (e) {
          logLine += ` :: [Unserializable JSON response]`;
        }
      }
      if (logLine.length > 1000) {
        // Increased limit slightly for more context
        logLine = logLine.slice(0, 999) + "…";
      }
      log(logLine);
    }
  });
  next();
});

// --- Main Application Logic ---
(async () => {
  // --- Route Registrations ---
  // 'registerRoutes' should ideally just configure 'app' and return void or 'app'.
  // We'll create the http.Server instance ourselves for clarity.
  await registerRoutes(app); // Assuming this configures app with main routes like auth

  registerApiTestRoute(app);
  registerPlaywrightTestRoutes(app);
  registerEnvTestRoutes(app);
  registerDirectFetchTestRoutes(app);
  registerWorkableDirectFetch(app);
  registerWorkableTestRoutes(app);

  if (process.env.NODE_ENV === "development") {
    registerDiagnosticsRoutes(app);
  }

  // --- Final Catch-All 404 Handler (AFTER all other routes) ---
  app.use((req: Request, res: Response, next: NextFunction) => {
    log(`[404 HANDLER] Path not found: ${req.method} ${req.path}`);
    if (!res.headersSent) {
      // For 404s, clients might not expect full CORS headers unless they need to read the body.
      // But if an OPTIONS request somehow got here, it would be blocked by browser anyway.
      // This is mainly for GET/POST etc. that don't match any route.
      res
        .status(404)
        .json({ message: `Resource Not Found: ${req.method} ${req.path}` });
    } else {
      next();
    }
  });

  // --- Global Error Handling Middleware (VERY LAST app.use) ---
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    log(
      `[ERROR HANDLER] Path: ${req.path}, Error Name: ${err.name}, Message: ${err.message}`
    );
    if (err.stack) {
      log(`[ERROR HANDLER] Stack: ${err.stack}`);
    }

    if (res.headersSent) {
      return next(err); // Delegate to default Express error handler if response already started
    }

    let status = err.status || err.statusCode || 500;
    let message = err.message || "Internal Server Error";
    let errors;

    // Check for ZodError structure
    if (err.issues && Array.isArray(err.issues)) {
      // Common ZodError structure
      message = "Validation error";
      errors = err.issues.map((e: any) => ({
        path: e.path,
        message: e.message,
      }));
      status = 400;
    } else if (err.errors && typeof err.flatten === "function") {
      // Another ZodError check
      message = "Validation error";
      errors = err.flatten().fieldErrors;
      status = 400;
    }

    // Set CORS headers for error responses too, so frontend can read the error body
    if (req.headers.origin === corsOriginToUse) {
      res.setHeader("Access-Control-Allow-Origin", corsOriginToUse);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    res.status(status).json({ message, errors });
  });

  // --- Start Server ---
  const httpServer = createServer(app); // Create an http.Server instance from the Express app
  const port = Number(process.env.PORT || 5000);

  httpServer.listen(port, "0.0.0.0", () => {
    log(`🚀 HTTP Server listening on port ${port}`);
  });
})();
