import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgres://knowflow:knowflow_password@localhost:5432/knowflow";

export const sqlClient = postgres(databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(sqlClient, { schema });

export type KnowflowDb = typeof db;

export async function closeDb(): Promise<void> {
  await sqlClient.end();
}
