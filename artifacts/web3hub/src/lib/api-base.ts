/**
 * Resolve `/api` prefix relative to Vite `import.meta.env.BASE_URL`.
 * When `BASE_URL` is `/` (common on Replit), callers must hit `/api/...`, not `api/...`.
 */
export function getApiBase(): string {
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (!trimmed || trimmed === "/") return "/api";
  return `${trimmed}/api`;
}
