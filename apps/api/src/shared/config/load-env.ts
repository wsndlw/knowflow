import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

let loaded = false;

export function loadEnv(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  for (let currentDirectory = process.cwd(); ; currentDirectory = path.dirname(currentDirectory)) {
    const envPath = path.join(currentDirectory, ".env");
    if (existsSync(envPath)) {
      process.env["KNOWFLOW_PROJECT_ROOT"] ??= currentDirectory;
      config({ path: envPath });
      return;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      config();
      return;
    }
  }
}

loadEnv();
