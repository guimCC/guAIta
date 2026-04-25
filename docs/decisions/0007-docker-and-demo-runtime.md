# 0007 - Docker And Demo Runtime

## Decision

Support fast local development with npm scripts and a Docker Compose demo mode.

## Context

During development, Vite and the backend should run quickly without container friction. During demo or teammate setup, Docker Compose provides one repeatable command and stable runtime behavior.

## Implications

- `npm run dev` should be the normal development path.
- `docker compose up --build` should be the demo/repro path.
- SQLite should use a mounted data volume in Docker.
- The same backend should serve API, Socket.IO, and the built frontend in demo mode.
