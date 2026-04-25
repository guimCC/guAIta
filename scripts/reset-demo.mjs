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

  const reset = await request("/api/demo/reset", { method: "POST" });
  const eventsDeleted = reset.reset?.eventsDeleted ?? 0;
  const callsDeleted = reset.reset?.callsDeleted ?? 0;
  const telemetryDeleted = reset.reset?.telemetryReadingsDeleted ?? 0;

  console.log(`Cleared ${eventsDeleted} stored detection event(s), ${callsDeleted} call(s), and ${telemetryDeleted} telemetry reading(s).`);
  console.log(`Scenario reset to ${reset.scenario?.status ?? "unknown"} at ${reset.scenario?.virtualNowIso ?? "unknown time"}.`);
  console.log(`Device listener is ${reset.deviceListening?.enabled ? "armed" : "disarmed"} for the next test.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
