import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let current = resolve(start);

  for (;;) {
    if (existsSync(join(current, "AGENTS.md")) && existsSync(join(current, ".env.example"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }

    current = parent;
  }
}

export const repoRoot = findRepoRoot(process.cwd()) || findRepoRoot(moduleDir);

const envPath = join(repoRoot, ".env");
const envExamplePath = join(repoRoot, ".env.example");

if (existsSync(envPath)) {
  dotenv.config({ path: envPath, override: false });
}

if (existsSync(envExamplePath)) {
  dotenv.config({ path: envExamplePath, override: false });
}

const placeholderValues = new Set([
  "replace_with_shared_device_token",
  "replace_with_maptiler_key"
]);

function cleanEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();

  if (!value || placeholderValues.has(value)) {
    return undefined;
  }

  return value;
}

function numberEnv(name: string, fallback: number): number {
  const rawValue = cleanEnv(name);
  const value = rawValue ? Number(rawValue) : Number.NaN;
  return Number.isFinite(value) ? value : fallback;
}

function resolveFromRepo(pathValue: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(repoRoot, pathValue);
}

function corsOrigins(): string[] {
  const value = cleanEnv("CORS_ORIGIN") ?? "http://localhost:5173";
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const config = {
  host: cleanEnv("HOST") ?? "0.0.0.0",
  port: numberEnv("PORT", 3000),
  databasePath: resolveFromRepo(cleanEnv("DATABASE_PATH") ?? "./data/guaita.db"),
  deviceToken: cleanEnv("DEVICE_TOKEN") ?? "demo-device-token",
  corsOrigins: corsOrigins()
};
