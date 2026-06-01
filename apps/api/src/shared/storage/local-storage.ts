import path from "node:path";

export function resolveLocalStorageRoot(): string {
  const configuredRoot = process.env["LOCAL_STORAGE_ROOT"] ?? "storage";
  if (path.isAbsolute(configuredRoot)) {
    return path.resolve(configuredRoot);
  }

  return path.resolve(process.env["KNOWFLOW_PROJECT_ROOT"] ?? process.cwd(), configuredRoot);
}
