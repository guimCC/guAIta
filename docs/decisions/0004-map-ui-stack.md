# 0004 - Map And UI Stack

## Decision

Use Vite, React, TypeScript, MapLibre GL JS, Tailwind, and shadcn-style local components.

## Context

The map is the main product surface. The UI should look like an operational command dashboard and support rich map overlays, fixed zones, alert pulses, event markers, and future editing features.

React Leaflet was considered, but MapLibre is a better fit for a polished WebGL map experience and future interactive overlays.

## Implications

- The first screen is the dashboard, not a landing page.
- Map style should be configurable through environment variables.
- Start with a free/open map style.
- Keep future ROI drawing and station dragging as upgrade-path features.
- Use a forest operational palette: dark dirt brown, tree green, amber, and critical red.
