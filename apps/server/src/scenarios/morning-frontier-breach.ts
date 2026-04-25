import type { DetectionEventInput, Direction } from "@guaita/shared";

export interface ScheduledDetection {
  id: string;
  atMs: number;
  stationId: string;
  confidence: number;
  count?: number;
  direction?: Direction;
  temperatureC?: number;
  humidityPct?: number;
  lightLux?: number;
  note: string;
}

export interface ScenarioDefinition {
  id: string;
  name: string;
  virtualStartIso: string;
  virtualEndIso: string;
  defaultSpeedMultiplier: number;
  events: ScheduledDetection[];
}

const minute = 60_000;

export const morningFrontierBreachScenario: ScenarioDefinition = {
  id: "morning-frontier-breach",
  name: "Morning Frontier Breach",
  virtualStartIso: "2026-04-25T02:30:00.000Z",
  virtualEndIso: "2026-04-25T08:30:00.000Z",
  defaultSpeedMultiplier: 120,
  events: [
    {
      id: "night-forest-quiet-01",
      atMs: 8 * minute,
      stationId: "forest-control-01",
      confidence: 0.54,
      direction: "unknown",
      temperatureC: 11.8,
      humidityPct: 84,
      lightLux: 3,
      note: "Low-confidence interior forest movement"
    },
    {
      id: "night-forest-quiet-02",
      atMs: 28 * minute,
      stationId: "forest-control-01",
      confidence: 0.61,
      direction: "left_to_right",
      temperatureC: 11.6,
      humidityPct: 86,
      lightLux: 4,
      note: "Ambient movement remains inside forest"
    },
    {
      id: "pre-dawn-west-01",
      atMs: 55 * minute,
      stationId: "containment-west-01",
      confidence: 0.66,
      direction: "towards_forest",
      temperatureC: 11.3,
      humidityPct: 87,
      lightLux: 8,
      note: "Possible western perimeter movement"
    },
    {
      id: "pre-dawn-edge-01",
      atMs: 82 * minute,
      stationId: "urban-edge-01",
      confidence: 0.58,
      direction: "towards_forest",
      temperatureC: 11.5,
      humidityPct: 82,
      lightLux: 24,
      note: "Low-confidence edge noise during dawn"
    },
    {
      id: "sunrise-forest-01",
      atMs: 118 * minute,
      stationId: "forest-control-01",
      confidence: 0.69,
      direction: "right_to_left",
      temperatureC: 12.4,
      humidityPct: 78,
      lightLux: 96,
      note: "Morning interior activity increasing"
    },
    {
      id: "sunrise-west-02",
      atMs: 148 * minute,
      stationId: "containment-west-01",
      confidence: 0.72,
      direction: "unknown",
      temperatureC: 13.1,
      humidityPct: 74,
      lightLux: 168,
      note: "Medium-confidence containment edge detection"
    },
    {
      id: "morning-frontier-ambient-01",
      atMs: 188 * minute,
      stationId: "frontier-gate-01",
      confidence: 0.64,
      direction: "towards_city",
      temperatureC: 14.8,
      humidityPct: 68,
      lightLux: 280,
      note: "Background movement near access frontier"
    },
    {
      id: "morning-urban-ambient-01",
      atMs: 222 * minute,
      stationId: "urban-edge-01",
      confidence: 0.62,
      direction: "left_to_right",
      temperatureC: 15.6,
      humidityPct: 63,
      lightLux: 420,
      note: "Urban-adjacent ambient activity"
    },
    {
      id: "morning-forest-return-01",
      atMs: 265 * minute,
      stationId: "forest-control-01",
      confidence: 0.67,
      direction: "towards_forest",
      temperatureC: 16.2,
      humidityPct: 58,
      lightLux: 610,
      note: "Activity returns toward interior forest"
    },
    {
      id: "late-morning-west-ambient-01",
      atMs: 318 * minute,
      stationId: "containment-west-01",
      confidence: 0.7,
      direction: "unknown",
      temperatureC: 17.3,
      humidityPct: 53,
      lightLux: 780,
      note: "Containment edge remains active but non-critical"
    }
  ]
};

export function scheduledDetectionToInput(
  scenario: ScenarioDefinition,
  detection: ScheduledDetection
): DetectionEventInput {
  const observedAt = new Date(new Date(scenario.virtualStartIso).getTime() + detection.atMs).toISOString();

  return {
    stationId: detection.stationId,
    observedAt,
    source: "scenario",
    species: "wild_boar",
    confidence: detection.confidence,
    count: detection.count ?? 1,
    direction: detection.direction,
    temperatureC: detection.temperatureC,
    humidityPct: detection.humidityPct,
    lightLux: detection.lightLux
  };
}
