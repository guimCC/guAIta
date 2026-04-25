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
  "replace_with_maptiler_key",
  "replace_with_elevenlabs_api_key",
  "replace_with_elevenlabs_agent_id",
  "replace_with_elevenlabs_phone_number_id",
  "replace_with_demo_recipient_number",
  "replace_with_webhook_token"
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

function booleanEnv(name: string, fallback: boolean): boolean {
  const rawValue = cleanEnv(name);

  if (!rawValue) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.toLowerCase());
}

function nodeEnv(): string {
  return cleanEnv("NODE_ENV") ?? "development";
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
  nodeEnv: nodeEnv(),
  host: cleanEnv("HOST") ?? "0.0.0.0",
  port: numberEnv("PORT", 3000),
  publicBaseUrl: cleanEnv("PUBLIC_TUNNEL_URL") ?? cleanEnv("PUBLIC_BASE_URL") ?? "http://localhost:3000",
  databasePath: resolveFromRepo(cleanEnv("DATABASE_PATH") ?? "./data/guaita.db"),
  eventImagesPath: resolveFromRepo(cleanEnv("EVENT_IMAGES_PATH") ?? "./data/event-images"),
  deviceToken: cleanEnv("DEVICE_TOKEN") ?? "demo-device-token",
  demoResetOnStart: booleanEnv("DEMO_RESET_ON_START", nodeEnv() !== "production"),
  deviceEventsEnabledOnStart: booleanEnv("DEVICE_EVENTS_ENABLED_ON_START", false),
  deviceEventsArmTtlMs: numberEnv("DEVICE_EVENTS_ARM_TTL_MS", 5 * 60_000),
  callsEnabled: booleanEnv("CALLS_ENABLED", false),
  civilProtectionDemoNumber: cleanEnv("CIVIL_PROTECTION_DEMO_NUMBER"),
  elevenLabsApiKey: cleanEnv("ELEVENLABS_API_KEY"),
  elevenLabsAgentId: cleanEnv("ELEVENLABS_AGENT_ID"),
  elevenLabsPhoneNumberId: cleanEnv("ELEVENLABS_AGENT_PHONE_NUMBER_ID"),
  elevenLabsWebhookToken: cleanEnv("ELEVENLABS_WEBHOOK_TOKEN"),
  corsOrigins: corsOrigins(),
  corsOrigin
};
