import type { Plugin } from "vite";

export function devBanner(): Plugin {
  return {
    name: "dev-banner",
  };
}

