import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const dbUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isNeon = dbUrl.includes("neon.tech");
export const pool = new Pool({
  connectionString: dbUrl,
  ssl: isNeon ? true : undefined,
  max: isNeon ? 5 : 10,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
