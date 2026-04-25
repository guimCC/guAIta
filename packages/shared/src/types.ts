import type { z } from "zod";
import type {
  ActionStatusSchema,
  AlertSchema,
  AlertStatusSchema,
  AcknowledgeCivilProtectionCallInputSchema,
  DetectionEventInputSchema,
  DetectionEventSchema,
  DetectionSourceSchema,
  DirectionSchema,
  RecommendedActionSchema,
  ScenarioStateSchema,
  ScenarioStatusSchema,
  SeveritySchema,
  CallStatusSchema,
  CivilProtectionCallSchema,
  StartCivilProtectionCallInputSchema,
  StationSchema,
  StationStatusSchema,
  StationTypeSchema,
  TelemetryReadingInputSchema,
  TelemetryReadingSchema,
  ZoneKindSchema,
  ZoneSchema
} from "./schemas.js";

export type DetectionSource = z.infer<typeof DetectionSourceSchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type ActionStatus = z.infer<typeof ActionStatusSchema>;
export type CallStatus = z.infer<typeof CallStatusSchema>;
export type ScenarioStatus = z.infer<typeof ScenarioStatusSchema>;
export type StationStatus = z.infer<typeof StationStatusSchema>;
export type StationType = z.infer<typeof StationTypeSchema>;
export type ZoneKind = z.infer<typeof ZoneKindSchema>;
export type Direction = z.infer<typeof DirectionSchema>;

export type DetectionEvent = z.infer<typeof DetectionEventSchema>;
export type DetectionEventInput = z.infer<typeof DetectionEventInputSchema>;
export type TelemetryReading = z.infer<typeof TelemetryReadingSchema>;
export type TelemetryReadingInput = z.infer<typeof TelemetryReadingInputSchema>;
export type Station = z.infer<typeof StationSchema>;
export type Zone = z.infer<typeof ZoneSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type CivilProtectionCall = z.infer<typeof CivilProtectionCallSchema>;
export type StartCivilProtectionCallInput = z.infer<typeof StartCivilProtectionCallInputSchema>;
export type AcknowledgeCivilProtectionCallInput = z.infer<typeof AcknowledgeCivilProtectionCallInputSchema>;
export type ScenarioState = z.infer<typeof ScenarioStateSchema>;
