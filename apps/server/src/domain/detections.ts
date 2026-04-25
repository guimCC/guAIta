import { randomUUID } from "node:crypto";
import {
  DetectionEventSchema,
  type DetectionEvent,
  type DetectionEventInput,
  type DetectionSource,
  type Severity,
  type Station
} from "@guaita/shared";

const telemetryValueKeys = ["temperatureC", "humidityPct", "lightLux", "batteryPct"] as const;

export function normalizeDetectionEvent(input: DetectionEventInput): DetectionEvent {
  const normalizedInput = { ...input } as Record<string, unknown>;

  for (const key of telemetryValueKeys) {
    if (normalizedInput[key] === null) {
      delete normalizedInput[key];
    }
  }

  return DetectionEventSchema.parse({
    ...normalizedInput,
    eventId: input.eventId ?? `evt_${input.source}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    observedAt: input.observedAt ?? new Date().toISOString()
  });
}

export function assertSource(input: { source: DetectionSource }, expectedSource: DetectionSource): void {
  if (input.source !== expectedSource) {
    throw new Error(`Expected source "${expectedSource}" but received "${input.source}".`);
  }
}

export function estimateSeverity(event: DetectionEvent, station?: Station): Severity {
  if (event.confidence >= 0.94 && station?.type === "frontier") {
    return "critical";
  }

  if (event.confidence >= 0.85 && ["frontier", "containment", "urban"].includes(station?.type ?? "")) {
    return "high";
  }

  if (event.confidence >= 0.7) {
    return "medium";
  }

  return "low";
}
