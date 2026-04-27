import { z } from "zod";

export const DetectionSourceSchema = z.enum(["device", "scenario", "manual"]);
export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const AlertStatusSchema = z.enum(["active", "acknowledged", "resolved"]);
export const ActionStatusSchema = z.enum(["pending", "dispatched", "completed", "cancelled"]);
export const CallStatusSchema = z.enum(["requested", "calling", "acknowledged", "completed", "failed"]);
export const ScenarioStatusSchema = z.enum(["idle", "running", "paused", "completed"]);
export const StationStatusSchema = z.enum(["online", "degraded", "offline"]);
export const StationTypeSchema = z.enum(["control", "frontier", "containment", "urban"]);
export const ZoneKindSchema = z.enum(["forest", "frontier", "urban", "containment"]);
export const SpeciesSchema = z.literal("wild_boar");
export const DirectionSchema = z.enum([
  "towards_city",
  "towards_forest",
  "left_to_right",
  "right_to_left",
  "unknown"
]);

export const LngLatSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90)
]);

export const ModelInfoSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  latencyMs: z.number().int().nonnegative().optional()
});

export const DetectionSnapshotInputSchema = z
  .object({
    contentType: z.enum(["image/jpeg", "image/png"]),
    encoding: z.literal("base64"),
    data: z.string().min(1).max(1_500_000)
  })
  .strict();

export const LiveStreamSessionSchema = z
  .object({
    stationId: z.string().min(1),
    active: z.boolean(),
    targetFps: z.number().positive(),
    frameIntervalMs: z.number().int().positive(),
    requestedAt: z.string().datetime().optional(),
    updatedAt: z.string().datetime(),
    expiresAt: z.string().datetime().optional(),
    lastFrameAt: z.string().datetime().optional(),
    lastFrameId: z.string().min(1).optional(),
    lastBoundingBoxesEnabled: z.boolean().optional()
  })
  .strict();

export const LiveStreamFrameInputSchema = z
  .object({
    stationId: z.string().min(1),
    capturedAt: z.string().datetime().nullish(),
    contentType: z.enum(["image/jpeg", "image/png"]),
    encoding: z.literal("base64"),
    data: z.string().min(1).max(1_050_000),
    boundingBoxesEnabled: z.boolean().optional(),
    frameWidth: z.number().int().positive().optional(),
    frameHeight: z.number().int().positive().optional(),
    boxes: z
      .array(
        z
          .object({
            label: z.string().min(1).optional(),
            confidence: z.number().min(0).max(1).optional(),
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive()
          })
          .strict()
      )
      .max(20)
      .optional()
  })
  .strict();

export const LiveStreamFrameSchema = z
  .object({
    stationId: z.string().min(1),
    frameId: z.string().min(1),
    capturedAt: z.string().datetime(),
    receivedAt: z.string().datetime(),
    contentType: z.enum(["image/jpeg", "image/png"]),
    dataUrl: z.string().min(1).optional(),
    boundingBoxesEnabled: z.boolean(),
    frameWidth: z.number().int().positive().optional(),
    frameHeight: z.number().int().positive().optional(),
    boxes: z
      .array(
        z
          .object({
            label: z.string().min(1).optional(),
            confidence: z.number().min(0).max(1).optional(),
            x: z.number(),
            y: z.number(),
            width: z.number().positive(),
            height: z.number().positive()
          })
          .strict()
      )
      .default([])
  })
  .strict();

const TemperatureSchema = z.number();
const HumidityPctSchema = z.number().min(0).max(100);
const LightLuxSchema = z.number().nonnegative();
const BatteryPctSchema = z.number().min(0).max(100);
const RssiDbmSchema = z.number();

const TelemetryReadingBodyShape = {
  stationId: z.string().min(1),
  observedAt: z.string().datetime(),
  source: DetectionSourceSchema,
  temperatureC: TemperatureSchema.optional(),
  humidityPct: HumidityPctSchema.optional(),
  lightLux: LightLuxSchema.optional(),
  batteryPct: BatteryPctSchema.optional(),
  rssiDbm: RssiDbmSchema.optional()
};

const TelemetryReadingInputBodyShape = {
  stationId: z.string().min(1),
  observedAt: z.string().datetime().nullish(),
  source: DetectionSourceSchema,
  temperatureC: TemperatureSchema.nullish(),
  humidityPct: HumidityPctSchema.nullish(),
  lightLux: LightLuxSchema.nullish(),
  batteryPct: BatteryPctSchema.nullish(),
  rssiDbm: RssiDbmSchema.nullish()
};

function requireTelemetryValue(
  value: {
    temperatureC?: number;
    humidityPct?: number;
    lightLux?: number;
    batteryPct?: number;
    rssiDbm?: number;
  },
  context: z.RefinementCtx
): void {
  if (
    value.temperatureC === undefined &&
    value.humidityPct === undefined &&
    value.lightLux === undefined &&
    value.batteryPct === undefined &&
    value.rssiDbm === undefined
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "At least one telemetry value is required.",
      path: ["temperatureC"]
    });
  }
}

export const TelemetryReadingSchema = z
  .object({
    ...TelemetryReadingBodyShape,
    telemetryId: z.string().min(1)
  })
  .superRefine(requireTelemetryValue);

export const TelemetryReadingInputSchema = z
  .object({
    ...TelemetryReadingInputBodyShape,
    telemetryId: z.string().min(1).nullish()
  });

const DetectionEventBodySchema = z.object({
  stationId: z.string().min(1),
  observedAt: z.string().datetime(),
  source: DetectionSourceSchema,
  species: SpeciesSchema,
  confidence: z.number().min(0).max(1),
  count: z.number().int().positive().default(1),
  direction: DirectionSchema.optional(),
  imageUrl: z.string().url().nullable().optional(),
  temperatureC: TemperatureSchema.optional(),
  humidityPct: HumidityPctSchema.optional(),
  lightLux: LightLuxSchema.optional(),
  batteryPct: BatteryPctSchema.optional(),
  model: ModelInfoSchema.optional()
});

export const DetectionEventSchema = DetectionEventBodySchema.extend({
  eventId: z.string().min(1)
});

export const DetectionEventInputSchema = DetectionEventBodySchema.extend({
  eventId: z.string().min(1).nullish(),
  observedAt: z.string().datetime().nullish(),
  snapshot: DetectionSnapshotInputSchema.nullish(),
  temperatureC: TemperatureSchema.nullish(),
  humidityPct: HumidityPctSchema.nullish(),
  lightLux: LightLuxSchema.nullish(),
  batteryPct: BatteryPctSchema.nullish()
});

export const StationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: StationTypeSchema,
  status: StationStatusSchema,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  zoneId: z.string().min(1).optional(),
  batteryPct: z.number().min(0).max(100).optional(),
  lastSeenAt: z.string().datetime().optional(),
  description: z.string().optional()
});

export const ZoneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ZoneKindSchema,
  severity: SeveritySchema,
  polygon: z.array(LngLatSchema).min(4),
  description: z.string().optional()
});

export const AlertSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  stationId: z.string().min(1),
  zoneId: z.string().min(1).optional(),
  severity: SeveritySchema,
  status: AlertStatusSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  source: DetectionSourceSchema,
  createdAt: z.string().datetime()
});

export const RecommendedActionSchema = z.object({
  id: z.string().min(1),
  alertId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  assignedTeam: z.string().min(1),
  status: ActionStatusSchema,
  priority: z.number().int().min(1).max(5),
  evidence: z.array(z.string().min(1)).default([]),
  createdAt: z.string().datetime()
});

export const CivilProtectionCallSchema = z.object({
  id: z.string().min(1),
  eventId: z.string().min(1),
  status: CallStatusSchema,
  provider: z.enum(["elevenlabs", "demo"]),
  toNumber: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  agentPhoneNumberId: z.string().min(1).optional(),
  conversationId: z.string().min(1).nullable().optional(),
  callSid: z.string().min(1).nullable().optional(),
  incidentSummary: z.string().min(1),
  acknowledgement: z.string().min(1).optional(),
  transcriptSummary: z.string().min(1).optional(),
  transcript: z.unknown().optional(),
  error: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  providerAcceptedAt: z.string().datetime().optional(),
  acknowledgedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  failedAt: z.string().datetime().optional()
});

export const StartCivilProtectionCallInputSchema = z.object({
  eventId: z.string().min(1),
  toNumber: z.string().min(1).optional(),
  force: z.boolean().optional()
});

export const AcknowledgeCivilProtectionCallInputSchema = z.object({
  callId: z.string().min(1).optional(),
  eventId: z.string().min(1).optional(),
  incidentId: z.string().min(1).optional(),
  outcome: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
}).refine((value) => Boolean(value.callId ?? value.eventId ?? value.incidentId), {
  message: "callId, eventId, or incidentId is required"
});

export const ScenarioStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: ScenarioStatusSchema,
  currentTimeMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  speedMultiplier: z.number().positive(),
  virtualStartIso: z.string().datetime(),
  virtualEndIso: z.string().datetime(),
  virtualNowIso: z.string().datetime(),
  nextEventAtMs: z.number().int().nonnegative().nullable(),
  firedEventCount: z.number().int().nonnegative(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime()
});
