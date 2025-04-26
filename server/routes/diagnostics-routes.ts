import { Express, Request, Response } from "express";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Register routes for application diagnostics
 */
export function registerDiagnosticsRoutes(app: Express) {
  // Serve the diagnostic tool page
  app.get("/application-diagnostics", (req, res) => {
    try {
      // Only allow in development mode
      const isDevelopment = process.env.NODE_ENV === "development";
      if (!isDevelopment) {
        return res.status(403).send("Diagnostics only available in development mode");
      }
      
      // Check if authenticated
      if (!req.isAuthenticated()) {
        return res.redirect("/auth?redirect=/application-diagnostics");
      }
      
      // Serve the HTML file
      const filePath = resolve("test-application-patterns.html");
      const html = readFileSync(filePath, "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.send(html);
    } catch (error) {
      console.error("Error serving diagnostics page:", error);
      res.status(500).send("Error loading diagnostics tool");
    }
  });
}