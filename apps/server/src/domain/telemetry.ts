import { randomUUID } from "node:crypto";
import {
  TelemetryReadingSchema,
  type TelemetryReading,
  type TelemetryReadingInput
} from "@guaita/shared";

export function normalizeTelemetryReading(input: TelemetryReadingInput): TelemetryReading {
  return TelemetryReadingSchema.parse({
    ...input,
    telemetryId: input.telemetryId ?? `tel_${input.source}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    observedAt: input.observedAt ?? new Date().toISOString()
  });
}
