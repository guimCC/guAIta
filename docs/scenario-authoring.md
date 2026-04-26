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
speed
```

## Virtual Time

Scenario events use virtual time. Live device events use real time.

If the scenario is running and the Arduino sends a detection while the backend device listener is armed, the backend stores and broadcasts the device event, auto-disarms the listener, then pauses the scenario clock so the live incident can be explained during the demo.

If the scenario is paused and the backend device listener is armed, the Arduino detection should still be accepted and shown as a live device event. While the listener is disarmed, device detections receive a `202` ignored response and do not create stored events or calls. Live detections do not start Civil Protection calls automatically; the dashboard operator must press **Call Civil Protection**.

The current MVP scenario uses this virtual time window:

```text
virtual start: 04:30
virtual end:   10:30
default speed: 120x
```

The frontend exposes `1x`, `10x`, `60x`, `120x`, `240x`, `480x`, `720x`, and `1440x`, plus a `+15m` advance control. Scenario detections use stronger non-escalating map effects, with irregular activity across the full virtual window so the map stays alive. A small number of scenario detections also drive explanatory Light Alerts for disease-behavior or sensor-health talking points. Manual and device detections remain the intended alert path, with call escalation gated by the operator.

## Event Sources

Use one shared event model with a `source` field:

```text
scenario
device
manual
```

## Authoring Guidance

- Keep the first scenario under 3 minutes.
- Include enough non-escalating detections to make the map feel alive throughout the demo.
- Keep Light Alerts selective and varied: repeated alert types are allowed, but the dashboard should balance disease-behavior, crepuscular activity, daylight wandering, blocked light readings, temperature anomaly, and low battery.
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
