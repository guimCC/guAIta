# 0004 - Map And UI Stack

## Decision

Use Vite, React, TypeScript, MapLibre GL JS, Tailwind, and shadcn-style local components.

## Context

The map is the main product surface. The UI should look like an operational command dashboard and support rich map overlays, fixed zones, alert pulses, event markers, and future editing features.

React Leaflet was considered, but MapLibre is a better fit for a polished WebGL map experience and future interactive overlays.

## Implications

- The first screen is the dashboard, not a landing page.
- Map style should be configurable through environment variables.
- Preferred map style is MapTiler Outdoor v4, configured with `VITE_MAPTILER_KEY` and `VITE_MAPTILER_STYLE_ID=outdoor-v4`.
- Use `https://tiles.openfreemap.org/styles/liberty` as the no-key fallback.
- Do not commit real map API keys. Use `.env.example` for placeholders and local `.env` for real values.
- Keep future ROI drawing and station dragging as upgrade-path features.
- Use a forest operational palette: dark dirt brown, tree green, amber, and critical red.
