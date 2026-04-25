# 0006 - Data And Database

## Decision

Use seed files for configured demo data and SQLite for runtime state.

## Context

The hackathon demo has controlled scenarios and limited runtime data. A hosted database or large ORM would add unnecessary setup.

## Implications

- Stations, zones, and scenarios can begin as TypeScript seed files.
- SQLite stores event history, alerts, actions, and scenario runs.
- The dashboard can refresh without losing the current demo state.
- The implementation stays easy to run locally and in Docker.
