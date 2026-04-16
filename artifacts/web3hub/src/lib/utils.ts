import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function truncateAddress(address: string | undefined) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function generateGradient(address: string | undefined) {
  if (!address) return "linear-gradient(135deg, #e0e0e0, #f5f5f5)";
  const color1 = `#${address.slice(2, 8)}`;
  const color2 = `#${address.slice(-6)}`;
  return `linear-gradient(135deg, ${color1}, ${color2})`;
}
