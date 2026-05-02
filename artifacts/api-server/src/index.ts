import express from "express";

const isProduction = process.env.NODE_ENV === "production";
const port = isProduction ? 8080 : Number(process.env.PORT || 8080);

// Start a minimal HTTP server immediately so the health-check probe succeeds
// as quickly as possible, then load the full app asynchronously.
const bootstrap = express();
const server = bootstrap.listen(port, () => {
  console.log(`Server listening on port ${port}${isProduction ? " (production)" : ""}`);
});

// Load and mount the full Express app after the port is already bound.
// This keeps the deployment health-check window short even on a cold start.
import("./app").then(({ default: app }) => {
  // Replace bootstrap handlers with the real app
  server.removeAllListeners("request");
  server.on("request", app);
}).catch((err) => {
  console.error("Failed to load app:", err);
  process.exit(1);
});
