import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? "postgres://knowflow:knowflow_password@localhost:5432/knowflow",
  },
  verbose: true,
  strict: true,
});
