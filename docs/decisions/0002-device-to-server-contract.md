# 0002 - Device To Server Contract

## Decision

Use HTTP JSON from the Arduino/UNO Q sender to the backend.

## Context

The device needs a simple, reliable way to send compact detection metadata. MQTT is a good IoT protocol, but it adds broker setup and operational complexity that is unnecessary for the hackathon MVP.

## Contract

```text
POST /api/device/events
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: application/json
```

The sender reads `serverUrl`, `deviceToken`, and `stationId` from config or environment variables.

## Implications

- The Arduino side does not need Socket.IO.
- The simulator can use the same endpoint and payload schema.
- ngrok URL changes do not require recompiling code if config is used.
- The backend owns validation, persistence, scoring, and broadcasting.
