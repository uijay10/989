import { createClient, type ResultSet } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import type { SQL } from "drizzle-orm";
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

const _db = drizzle(client, { schema });

/** Execute a raw drizzle sql`` query (SELECT or DML). Compiles via the internal dialect. */
async function execute(query: SQL | string): Promise<ResultSet> {
  if (typeof query === "string") {
    return client.execute(query);
  }
  // Use Drizzle's internal dialect to compile the SQL template to { sql, params }
  const dialect = (_db as any).dialect;
  if (dialect?.sqlToQuery) {
    const compiled: { sql: string; params: unknown[] } = dialect.sqlToQuery(query);
    return client.execute({ sql: compiled.sql, args: compiled.params as any[] });
  }
  // Fallback: iterate queryChunks manually
  const chunks: unknown[] = (query as any).queryChunks ?? [];
  let sqlStr = "";
  const args: unknown[] = [];
  for (const chunk of chunks) {
    if (typeof chunk === "string") {
      sqlStr += chunk;
    } else if (chunk && typeof chunk === "object") {
      const v = (chunk as any).value;
      if (v !== undefined) {
        args.push(v);
        sqlStr += "?";
      } else {
        // nested SQL object
        const inner = (chunk as any).queryChunks;
        if (Array.isArray(inner)) {
          for (const ic of inner) {
            if (typeof ic === "string") {
              sqlStr += ic;
            } else if (ic && typeof ic === "object" && (ic as any).value !== undefined) {
              args.push((ic as any).value);
              sqlStr += "?";
            }
          }
        }
      }
    }
  }
  return client.execute({ sql: sqlStr, args: args as any[] });
}

// Attach execute as a method on the db object for drop-in compatibility
export const db = Object.assign(_db, { execute });

export * from "./schema";
