import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "./vite-plugins/runtime-error-overlay";
import { cartographer } from "./vite-plugins/cartographer";
import { devBanner } from "./vite-plugins/dev-banner";

const isBuild = process.argv.includes("build");

const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

const basePath = process.env.BASE_PATH ?? "/";

if (!isBuild && !process.env.PORT) {
  throw new Error("PORT environment variable is required but was not provided.");
}

if (!isBuild && !process.env.BASE_PATH) {
  throw new Error("BASE_PATH environment variable is required but was not provided.");
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    // Optional tooling when running in a hosted dev environment.
    ...(process.env.NODE_ENV !== "production" &&
    process.env.HOSTED_DEV_ENV !== undefined
      ? [
          cartographer({ root: path.resolve(import.meta.dirname, "..") }),
          devBanner(),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
