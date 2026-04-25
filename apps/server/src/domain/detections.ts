import { randomUUID } from "node:crypto";
import {
  DetectionEventSchema,
  type DetectionEvent,
  type DetectionEventInput,
  type DetectionSource,
  type Severity,
  type Station
} from "@guaita/shared";

export function normalizeDetectionEvent(input: DetectionEventInput): DetectionEvent {
  return DetectionEventSchema.parse({
    ...input,
    eventId: input.eventId ?? `evt_${input.source}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    observedAt: input.observedAt ?? new Date().toISOString()
  });
}

export function assertSource(input: DetectionEventInput, expectedSource: DetectionSource): void {
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
