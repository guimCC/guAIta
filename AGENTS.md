# guAIta Agent Instructions

## Project Context

guAIta is a 36-hour HackUPC proof of concept for Edge AI monitoring around Collserola. The core story is: edge devices detect wild boars locally, send compact events to a central server, and the dashboard helps operators understand risk and respond faster.

The hackathon requires the Arduino UNO Q and Edge AI to be central. The server and dashboard support the story, but they must not hide the fact that detection or classification happens on-device.

## Build Priorities

- Prioritize a reliable 3-minute demo over broad product completeness.
- Keep the map/dashboard as the main product surface.
- Prefer deterministic scenarios and seed data over complex dynamic systems.
- Make Arduino/device events and simulator events use the same schema.
- Keep the backend simple and observable.
- Keep the frontend polished, interactive, and operational-looking.
- Document architecture decisions when changing stack, data flow, or demo behavior.

## Scope Boundaries

- Do not build a full GIS editor unless explicitly requested.
- Zones, stations, and scenarios may be preconfigured in seed files.
- ROI/containment drawing, station dragging, and advanced map editing are upgrade-path features.
- LLM-generated recommendations are v2. The MVP recommendation engine should be deterministic and work offline.
- Temperature, humidity, light, and battery telemetry are useful fields, but the MVP should not depend on a real predictive model.

## Technical Direction

- Monorepo: npm workspaces.
- Backend: Node.js, TypeScript, Fastify.
- Realtime: Socket.IO.
- Validation: Zod schemas in `packages/shared`.
- Database: SQLite for simple local persistence.
- Frontend: Vite, React, TypeScript.
- Map: MapLibre GL JS.
- UI: Tailwind plus shadcn-style local components.
- Demo exposure: local server through ngrok static domain where possible.

## Event Model

Everything important should be modeled as an event:

- device detection
- simulated detection
- manual event
- alert creation
- recommended action
- dispatch/status update
- scenario timeline step

Every event should include a `source` when relevant:

- `device`
- `scenario`
- `manual`

## Device Contract

The Arduino/UNO Q sender should not hardcode a changing URL. It should read `serverUrl`, `deviceToken`, and `stationId` from config or environment variables. If the ngrok URL changes, update config and restart the sender process; do not recompile device code.

The preferred hackathon flow is:

```text
UNO Q vision model detects boar
-> sender builds JSON event
-> sender POSTs to /api/device/events
-> server validates, stores, scores, and broadcasts
-> dashboard updates in realtime
```

## Visual Direction

Use an operational forest palette:

- dark dirt brown / charcoal background
- tree green primary accent
- amber warning
- controlled red critical alerts
- muted brown borders and panels

The UI should feel like a compact command dashboard, not a marketing page.

## Documentation Expectations

When future agents change core behavior, update the relevant file:

- `docs/architecture.md` for system structure.
- `docs/device-contract.md` for Arduino/server payload changes.
- `docs/scenario-authoring.md` for scenario mechanics.
- `docs/demo-story.md` for presentation flow.
- `docs/upgrade-path.md` for deferred features.
- `docs/decisions/*` for meaningful architecture decisions.
