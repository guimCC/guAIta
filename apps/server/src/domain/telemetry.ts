import { randomUUID } from "node:crypto";
import {
  TelemetryReadingSchema,
  type TelemetryReading,
  type TelemetryReadingInput
} from "@guaita/shared";

const telemetryValueKeys = ["temperatureC", "humidityPct", "lightLux", "batteryPct", "rssiDbm"] as const;

export function hasTelemetryValues(input: TelemetryReadingInput): boolean {
  return telemetryValueKeys.some((key) => input[key] !== null && input[key] !== undefined);
}

export function normalizeTelemetryReading(input: TelemetryReadingInput): TelemetryReading {
  const normalizedInput = { ...input } as Record<string, unknown>;

  for (const key of telemetryValueKeys) {
    if (normalizedInput[key] === null) {
      delete normalizedInput[key];
    }
  }

  return TelemetryReadingSchema.parse({
    ...normalizedInput,
    telemetryId: input.telemetryId ?? `tel_${input.source}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    observedAt: input.observedAt ?? new Date().toISOString()
  });
}
