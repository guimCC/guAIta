import { z } from "zod";

export const DetectionSourceSchema = z.enum(["device", "scenario", "manual"]);
export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const AlertStatusSchema = z.enum(["active", "acknowledged", "resolved"]);
export const ActionStatusSchema = z.enum(["pending", "dispatched", "completed", "cancelled"]);
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

const DetectionEventBodySchema = z.object({
  stationId: z.string().min(1),
  observedAt: z.string().datetime(),
  source: DetectionSourceSchema,
  species: SpeciesSchema,
  confidence: z.number().min(0).max(1),
  count: z.number().int().positive().default(1),
  direction: DirectionSchema.optional(),
  imageUrl: z.string().url().nullable().optional(),
  temperatureC: z.number().optional(),
  humidityPct: z.number().min(0).max(100).optional(),
  lightLux: z.number().nonnegative().optional(),
  batteryPct: z.number().min(0).max(100).optional(),
  model: ModelInfoSchema.optional()
});

export const DetectionEventSchema = DetectionEventBodySchema.extend({
  eventId: z.string().min(1)
});

export const DetectionEventInputSchema = DetectionEventBodySchema.extend({
  eventId: z.string().min(1).optional(),
  observedAt: z.string().datetime().optional()
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

export const ScenarioStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: ScenarioStatusSchema,
  currentTimeMs: z.number().int().nonnegative(),
  durationMs: z.number().int().positive(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime()
});
