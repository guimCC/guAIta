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

function isPrivateDevelopmentHost(hostname: string): boolean {
  if (["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const match = hostname.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}

function isAllowedCorsOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  if (config.corsOrigins.includes(origin)) {
    return true;
  }

  if (config.nodeEnv === "production") {
    return false;
  }

  try {
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && isPrivateDevelopmentHost(url.hostname);
  } catch {
    return false;
  }
}

function corsOrigin(origin: string | undefined, callback: (error: Error | null, allow: boolean) => void): void {
  callback(null, isAllowedCorsOrigin(origin));
}

export const config = {
  nodeEnv: cleanEnv("NODE_ENV") ?? "development",
  host: cleanEnv("HOST") ?? "0.0.0.0",
  port: numberEnv("PORT", 3000),
  databasePath: resolveFromRepo(cleanEnv("DATABASE_PATH") ?? "./data/guaita.db"),
  deviceToken: cleanEnv("DEVICE_TOKEN") ?? "demo-device-token",
  corsOrigins: corsOrigins(),
  corsOrigin
};
