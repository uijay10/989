import type { Plugin } from "vite";

export type CartographerOptions = {
  root: string;
};

export function cartographer(_options: CartographerOptions): Plugin {
  return {
    name: "cartographer",
  };
}

