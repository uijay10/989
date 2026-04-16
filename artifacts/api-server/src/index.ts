import app from "./app";

// Production: always bind to 8080 — Replit deployment forwards localPort:8080 → externalPort:80.
// The deployment run command sets PORT=5000 for legacy reasons, but Replit's promote
// health-check waits for port 8080. Development workflows already set PORT=8080 explicitly.
const isProduction = process.env.NODE_ENV === "production";
const port = isProduction ? 8080 : Number(process.env.PORT || 8080);

if (!isProduction && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}${isProduction ? " (production)" : ""}`);
});
