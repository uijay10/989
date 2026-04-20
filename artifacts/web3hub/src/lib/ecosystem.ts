export type EcosystemKind = "chain" | "exchange";

export const CHAINS = [
  "Ethereum",
  "Solana",
  "BNB Chain",
  "Arbitrum",
  "Base",
  "Optimism",
  "Sui",
  "Aptos",
] as const;

export const EXCHANGES = [
  "Binance",
  "OKX",
  "Bybit",
  "Coinbase",
  "Kraken",
] as const;

export function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeEcosystemSectionId(kind: EcosystemKind, name: string) {
  return `${kind}:${slugify(name)}`;
}

export function parseEcosystemSectionId(sectionId: string): { kind: EcosystemKind; slug: string } | null {
  const m = sectionId.match(/^(chain|exchange):([a-z0-9-]+)$/);
  if (!m) return null;
  return { kind: m[1] as EcosystemKind, slug: m[2] };
}

export function getEcosystemDisplayNameBySlug(kind: EcosystemKind, slug: string) {
  const list = kind === "chain" ? (CHAINS as readonly string[]) : (EXCHANGES as readonly string[]);
  return list.find((n) => slugify(n) === slug) ?? slug;
}

