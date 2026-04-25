# Scenario Authoring

## Purpose

Scenarios make the demo deterministic, rehearseable, and visually complete even with only one physical device.

## Principle

Script the story, not the whole world.

The goal is to show a plausible deployed network with multiple stations, alerts, and actions. The MVP does not need a full simulation engine.

## Scenario Shape

Scenarios should live in TypeScript under:

```text
apps/server/src/scenarios/
```

Suggested structure:

```ts
export const morningFrontierBreach = {
  id: "morning-frontier-breach",
  name: "Morning Frontier Breach",
  durationMs: 180000,
  initialClockMs: 0,
  events: [
    {
      atMs: 10000,
      type: "detection",
      stationId: "forest-control-01",
      species: "wild_boar",
      confidence: 0.82,
      direction: "towards_city",
      telemetry: {
        temperatureC: 16.8,
        humidityPct: 72
      }
    }
  ]
}
```

## Required Controls

The backend should own scenario state and expose controls:

```text
start
pause
resume
advance
reset
```

## Virtual Time

Scenario events use virtual time. Live device events use real time.

If the scenario is paused and the Arduino sends a detection, the detection should still be accepted and shown as a live device event.

## Event Sources

Use one shared event model with a `source` field:

```text
scenario
device
manual
```

## Authoring Guidance

- Keep the first scenario under 3 minutes.
- Include 5-10 detections, not dozens.
- Include at least one escalating pattern.
- Include at least one recommended action.
- Include one quiet period so pause/advance controls feel useful.
- Make every scripted event support the spoken demo story.

## Good Scenario Beats

- Early low-risk forest detection.
- Repeated detections moving toward a boundary.
- High-confidence detection near a frontier station.
- Alert severity increase.
- Recommended action creation.
- Optional response vehicle marker/status update.
- Live Arduino event inserted during the run.
