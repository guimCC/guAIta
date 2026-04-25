# Architecture

## Goal

Build a reliable demo system where a real or simulated edge device detects wild boars, sends compact events to a server, and a realtime dashboard shows operational risk, recommendations, and scenario progress.

## Core Constraints

- The Arduino UNO Q must remain the technical centerpiece.
- The dashboard should work before the hardware path is complete.
- Device events and simulated events must share one schema.
- The demo should be deterministic enough to rehearse.
- The backend should be small enough to understand under hackathon pressure.

## System Overview

```mermaid
flowchart LR
  A["Arduino UNO Q\nCamera + Edge AI model"] -->|HTTP JSON| B["Fastify Server"]
  C["Scenario Engine"] -->|same event schema| B
  D["Manual Demo Controls"] -->|same event schema| B
  B --> E["SQLite\nstations, zones, events, actions"]
  B -->|Socket.IO realtime| F["React Dashboard"]
  F --> G["MapLibre Map\nstations, zones, alerts"]
  F --> H["Sidebars\nmetrics, actions, timeline"]
```

## Runtime Data Flow

1. A device, scenario, or manual control creates a detection event.
2. The backend validates the event with shared Zod schemas.
3. The backend stores the event in SQLite.
4. The risk engine assigns severity using station, zone, confidence, and scenario context.
5. The action recommender creates one or more recommended actions.
6. Socket.IO broadcasts the new detection, alert, and action to connected dashboards.
7. The frontend updates the map, sidebars, metrics, and event graph.

## Proposed Monorepo Layout

```text
apps/
  server/
    src/
      index.ts
      routes/
      domain/
      db/
      seeds/
      scenarios/
  web/
    src/
      app/
      features/
      theme/

packages/
  shared/
    src/
      schemas.ts
      types.ts
      events.ts

docs/
  decisions/
```

## Backend Responsibilities

- Expose device ingestion endpoint.
- Expose scenario controls.
- Store events, stations, zones, actions, and scenario runs.
- Run deterministic risk scoring.
- Run deterministic action recommendations.
- Broadcast realtime updates through Socket.IO.
- Serve the built frontend in demo/production mode.

Primary routes:

```text
GET  /health
POST /api/device/events
GET  /api/events
GET  /api/stations
GET  /api/zones
GET  /api/actions
POST /api/scenario/start
POST /api/scenario/pause
POST /api/scenario/resume
POST /api/scenario/advance
POST /api/scenario/reset
POST /api/manual/events
```

## Frontend Responsibilities

- Render the live operational map.
- Show fixed stations and fixed risk/containment zones.
- Show detection pulses, alert severity, and optional movement direction.
- Show scenario controls and virtual time.
- Show key metrics and event graphs.
- Show active alerts, evidence, and recommended actions.
- Clearly distinguish live device events from scenario/manual events.

Preferred dashboard layout:

```text
left sidebar: scenario controls, virtual time, station summary, metrics
center: full map with stations, zones, detections, response markers
right sidebar: active alert, evidence, recommended action, action status
bottom: event timeline and detection graph
```

## Database Shape

SQLite is enough for the MVP. Seed files should remain the editable source for stations, zones, and scenarios.

Suggested tables:

```text
stations
zones
events
alerts
recommended_actions
scenario_runs
```

Do not add a large ORM unless the project clearly needs it. Prefer a tiny database wrapper and explicit SQL.

## Realtime Model

Use Socket.IO between server and browser.

The Arduino/device does not use Socket.IO. It posts HTTP JSON only.

Suggested realtime events:

```text
detection.created
alert.created
action.created
action.updated
station.updated
scenario.started
scenario.paused
scenario.resumed
scenario.advanced
scenario.reset
```

## Scenario And Clock Model

Scenario time is virtual and controllable. Device events are real-time.

- Scenario events follow `currentTimeMs`.
- Scenario can be paused, resumed, advanced, or reset.
- Live Arduino/device events should still enter the system even when scenario time is paused.
- The UI should label live events clearly.

## Action Recommendation Model

The MVP recommender is deterministic and rule-based. It should create useful, explainable actions from event context.

Examples:

- Deploy civil protection unit near a busy access point before morning peak.
- Dispatch wildlife response to a containment frontier.
- Send cleaning crew to an urban/trash-adjacent zone with rising detection rates.
- Increase nearby station sampling after repeated low-confidence events.

LLM-generated explanation is a v2 plugin, not an MVP dependency.
