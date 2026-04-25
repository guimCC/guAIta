#!/usr/bin/env node

const defaultBaseUrl = process.env.GUAITA_API_BASE_URL ?? process.env.VITE_API_BASE_URL ?? "http://localhost:3000";
const baseUrl = defaultBaseUrl.replace(/\/$/, "");

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  let body;

  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!response.ok || body.ok === false) {
    const message = body.message ?? body.error ?? response.statusText;
    throw new Error(`${init.method} ${path} failed: ${response.status} ${message}`);
  }

  return body;
}

async function main() {
  console.log(`Resetting guAIta demo state at ${baseUrl}`);

  const health = await fetch(`${baseUrl}/health`).then((response) => response.json());
  if (!health.ok) {
    throw new Error("guAIta server health check failed.");
  }

  const events = await request("/api/events", { method: "DELETE" });
  const scenario = await request("/api/scenario/reset", { method: "POST" });

  console.log(`Cleared ${events.deletedCount ?? 0} stored detection event(s) and related call(s).`);
  console.log(`Scenario reset to ${scenario.scenario?.status ?? "unknown"} at ${scenario.scenario?.virtualNowIso ?? "unknown time"}.`);
  console.log("Refresh the dashboard before the next test.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
