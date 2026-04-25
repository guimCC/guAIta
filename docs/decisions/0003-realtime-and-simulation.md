# 0003 - Realtime And Simulation

## Decision

Use Socket.IO for backend-to-dashboard realtime updates and a backend-owned scenario engine for scripted demo events.

## Context

The dashboard needs reliable realtime updates during a live demo. Socket.IO gives named events and reconnection behavior. Scenarios need to be deterministic and controllable, so scenario timing should live on the backend rather than only in frontend timers.

## Implications

- Browsers subscribe to realtime detection, alert, action, and scenario events.
- The Arduino/UNO Q posts HTTP JSON and does not use Socket.IO.
- Scenario events use virtual time.
- Device events use real time and can arrive while a scenario is paused.
