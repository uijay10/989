import type { Plugin } from "vite";

export default function runtimeErrorOverlay(): Plugin {
  return {
    name: "runtime-error-overlay",
  };
}

