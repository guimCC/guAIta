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
  batteryPct?: number;
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
      id: "opening-non-risk-35",
      atMs: 1 * minute,
      stationId: "collserola-control-35",
      confidence: 0.49,
      direction: "unknown",
      temperatureC: 11.9,
      humidityPct: 83,
      lightLux: 2,
      note: "Initial low-confidence thermal movement at a non-risk control station"
    },
    {
      id: "opening-non-risk-24",
      atMs: 3 * minute,
      stationId: "collserola-control-24",
      confidence: 0.53,
      direction: "left_to_right",
      temperatureC: 11.8,
      humidityPct: 84,
      lightLux: 2,
      note: "Interior forest movement candidate"
    },
    {
      id: "opening-non-risk-54",
      atMs: 5 * minute,
      stationId: "collserola-control-54",
      confidence: 0.57,
      direction: "right_to_left",
      temperatureC: 11.7,
      humidityPct: 84,
      lightLux: 3,
      note: "Weak non-risk station motion cue"
    },
    {
      id: "opening-non-risk-29",
      atMs: 8 * minute,
      stationId: "collserola-control-29",
      confidence: 0.54,
      direction: "unknown",
      temperatureC: 11.8,
      humidityPct: 84,
      lightLux: 3,
      note: "Low-confidence movement away from the risk band"
    },
    {
      id: "opening-non-risk-48",
      atMs: 12 * minute,
      stationId: "collserola-control-48",
      confidence: 0.5,
      direction: "towards_forest",
      temperatureC: 11.7,
      humidityPct: 85,
      lightLux: 3,
      note: "Background motion at a non-risk station returns toward forest"
    },
    {
      id: "opening-non-risk-32",
      atMs: 17 * minute,
      stationId: "collserola-control-32",
      confidence: 0.59,
      direction: "right_to_left",
      temperatureC: 11.6,
      humidityPct: 85,
      lightLux: 4,
      note: "Dispersed interior motion cue confirms active start"
    },
    {
      id: "opening-non-risk-55",
      atMs: 22 * minute,
      stationId: "collserola-control-55",
      confidence: 0.62,
      direction: "towards_forest",
      temperatureC: 11.6,
      humidityPct: 86,
      lightLux: 4,
      note: "Non-risk station movement remains non-critical"
    },
    {
      id: "opening-non-risk-42",
      atMs: 28 * minute,
      stationId: "collserola-control-42",
      confidence: 0.61,
      direction: "left_to_right",
      temperatureC: 10.9,
      humidityPct: 89,
      lightLux: 7,
      note: "Ambient movement remains away from the risk band"
    },
    {
      id: "continuous-non-risk-47",
      atMs: 38 * minute,
      stationId: "collserola-control-47",
      confidence: 0.56,
      direction: "right_to_left",
      temperatureC: 11.5,
      humidityPct: 86,
      lightLux: 5,
      note: "Low-confidence dispersed activity continues"
    },
    {
      id: "continuous-non-risk-25",
      atMs: 46 * minute,
      stationId: "collserola-control-25",
      confidence: 0.52,
      direction: "unknown",
      temperatureC: 11.4,
      humidityPct: 87,
      lightLux: 6,
      note: "Scattered non-risk station movement"
    },
    {
      id: "pre-dawn-west-01",
      atMs: 55 * minute,
      stationId: "containment-west-01",
      confidence: 0.66,
      direction: "towards_forest",
      temperatureC: 10.7,
      humidityPct: 92,
      lightLux: 9,
      note: "Possible western perimeter movement"
    },
    {
      id: "continuous-non-risk-52",
      atMs: 64 * minute,
      stationId: "collserola-control-52",
      confidence: 0.6,
      direction: "left_to_right",
      temperatureC: 11.2,
      humidityPct: 88,
      lightLux: 11,
      note: "Continuous background activity at a non-risk station"
    },
    {
      id: "continuous-non-risk-34",
      atMs: 72 * minute,
      stationId: "collserola-control-34",
      confidence: 0.55,
      direction: "towards_forest",
      temperatureC: 11.4,
      humidityPct: 85,
      lightLux: 16,
      note: "Dispersed pre-dawn movement remains non-critical"
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
      id: "continuous-non-risk-19",
      atMs: 94 * minute,
      stationId: "collserola-control-19",
      confidence: 0.58,
      direction: "left_to_right",
      temperatureC: 11.8,
      humidityPct: 81,
      lightLux: 42,
      note: "Irregular low-risk activity before sunrise"
    },
    {
      id: "continuous-non-risk-56",
      atMs: 104 * minute,
      stationId: "collserola-control-56",
      confidence: 0.63,
      direction: "unknown",
      temperatureC: 12.1,
      humidityPct: 80,
      lightLux: 66,
      note: "Scattered movement continues away from escalation points"
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
      id: "continuous-non-risk-28",
      atMs: 130 * minute,
      stationId: "collserola-control-28",
      confidence: 0.57,
      direction: "right_to_left",
      temperatureC: 12.7,
      humidityPct: 76,
      lightLux: 118,
      note: "Ambient activity keeps the map active"
    },
    {
      id: "continuous-non-risk-50",
      atMs: 139 * minute,
      stationId: "collserola-control-50",
      confidence: 0.65,
      direction: "towards_forest",
      temperatureC: 12.9,
      humidityPct: 75,
      lightLux: 142,
      note: "Non-risk movement remains visible after sunrise"
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
      id: "continuous-non-risk-33",
      atMs: 159 * minute,
      stationId: "collserola-control-33",
      confidence: 0.54,
      direction: "unknown",
      temperatureC: 13.5,
      humidityPct: 72,
      lightLux: 18,
      note: "Unexpectedly low daylight reading suggests possible light sensor obstruction"
    },
    {
      id: "continuous-non-risk-44",
      atMs: 171 * minute,
      stationId: "collserola-control-44",
      confidence: 0.61,
      direction: "left_to_right",
      temperatureC: 14.1,
      humidityPct: 70,
      lightLux: 238,
      note: "Dispersed movement remains non-escalating"
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
      id: "continuous-non-risk-21",
      atMs: 201 * minute,
      stationId: "collserola-control-21",
      confidence: 0.55,
      direction: "right_to_left",
      temperatureC: 15.0,
      humidityPct: 66,
      lightLux: 328,
      note: "Non-risk activity continues across the map"
    },
    {
      id: "continuous-non-risk-53",
      atMs: 212 * minute,
      stationId: "collserola-control-53",
      confidence: 0.6,
      direction: "unknown",
      temperatureC: 15.3,
      humidityPct: 64,
      lightLux: 374,
      note: "Irregular background detection during morning"
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
      id: "continuous-non-risk-30",
      atMs: 235 * minute,
      stationId: "collserola-control-30",
      confidence: 0.58,
      direction: "towards_forest",
      temperatureC: 15.8,
      humidityPct: 62,
      lightLux: 480,
      note: "Low-risk detection keeps the operational map alive"
    },
    {
      id: "continuous-non-risk-45",
      atMs: 248 * minute,
      stationId: "collserola-control-45",
      confidence: 0.66,
      direction: "left_to_right",
      temperatureC: 23.8,
      humidityPct: 60,
      lightLux: 540,
      note: "Temperature anomaly detected during late-morning monitoring"
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
      id: "continuous-non-risk-37",
      atMs: 279 * minute,
      stationId: "collserola-control-37",
      confidence: 0.59,
      direction: "unknown",
      temperatureC: 16.5,
      humidityPct: 57,
      lightLux: 660,
      note: "Scattered low-risk station activity"
    },
    {
      id: "continuous-non-risk-58",
      atMs: 294 * minute,
      stationId: "collserola-control-58",
      confidence: 0.63,
      direction: "right_to_left",
      temperatureC: 16.8,
      humidityPct: 55,
      lightLux: 710,
      note: "Map activity continues without escalation"
    },
    {
      id: "continuous-non-risk-26",
      atMs: 306 * minute,
      stationId: "collserola-control-26",
      confidence: 0.56,
      direction: "towards_forest",
      temperatureC: 17.0,
      humidityPct: 54,
      lightLux: 744,
      batteryPct: 18,
      note: "Late-run non-risk station detection"
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
    },
    {
      id: "continuous-non-risk-46",
      atMs: 331 * minute,
      stationId: "collserola-control-46",
      confidence: 0.62,
      direction: "left_to_right",
      temperatureC: 17.5,
      humidityPct: 52,
      lightLux: 820,
      note: "Continuous background detection near the end of the run"
    },
    {
      id: "continuous-non-risk-23",
      atMs: 344 * minute,
      stationId: "collserola-control-23",
      confidence: 0.57,
      direction: "unknown",
      temperatureC: 17.8,
      humidityPct: 51,
      lightLux: 850,
      note: "Final low-risk scattered activity"
    },
    {
      id: "continuous-non-risk-39",
      atMs: 354 * minute,
      stationId: "collserola-control-39",
      confidence: 0.6,
      direction: "right_to_left",
      temperatureC: 18.0,
      humidityPct: 50,
      lightLux: 880,
      note: "Scenario activity remains visible through the final minutes"
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
    lightLux: detection.lightLux,
    batteryPct: detection.batteryPct
  };
}
