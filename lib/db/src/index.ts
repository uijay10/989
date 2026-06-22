import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function resolveTursoConfig(): { url: string; authToken?: string } {
  const candidates = [
    process.env.TURSO,
    process.env.TURSO_DATABASE_URL,
    process.env.TURSO_URL,
    process.env.LIBSQL_URL,
  ].filter(Boolean) as string[];

  let url: string | undefined;
  let authToken: string | undefined;

  for (const c of candidates) {
    if (c.startsWith("libsql://") || c.startsWith("http://") || c.startsWith("https://")) {
      url = url ?? c;
    } else if (c.startsWith("eyJ") || c.startsWith("ey")) {
      authToken = authToken ?? c;
    }
  }

  if (!url) {
    throw new Error(
      "Turso URL not found. Set TURSO (libsql://...) and TURSO_DATABASE_URL (eyJ... token) env vars."
    );
  }

  return { url, authToken };
}

const { url, authToken } = resolveTursoConfig();
export const client = createClient({ url, authToken });
export const db = drizzle(client, { schema });

export * from "./schema";
