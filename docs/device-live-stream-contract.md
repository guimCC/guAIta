# Device Live Stream Contract

Status: implemented for the demo path.

## Goal

Allow the dashboard operator to open a compact live camera viewer for a station. The Arduino UNO Q does not accept inbound browser or server connections. Instead, it polls the server for an active stream session and uploads low-rate JPEG frames while the session is active.

This keeps the demo reliable through localhost, ngrok, or another public tunnel.

## Flow

```text
1. Operator presses a station camera icon in the dashboard.
2. Dashboard POSTs /api/streams/{stationId}/start.
3. Server stores an in-memory stream session for that station and broadcasts stream.session.updated.
4. Arduino polls /api/device/stream-state?stationId={stationId}.
5. If active, Arduino uploads JPEG frames to /api/device/stream-frames at the requested interval.
6. Server validates each frame and broadcasts stream.frame through Socket.IO.
7. Dashboard renders the latest frame in the live viewer.
8. Closing the viewer POSTs /api/streams/{stationId}/stop.
```

## Dashboard Endpoints

```text
POST /api/streams/{stationId}/start
POST /api/streams/{stationId}/stop
GET  /api/streams/{stationId}
```

Responses include:

```json
{
  "ok": true,
  "stream": {
    "stationId": "collserola-control-02",
    "active": true,
    "targetFps": 2,
    "frameIntervalMs": 500,
    "requestedAt": "2026-04-26T08:10:00.000Z",
    "updatedAt": "2026-04-26T08:10:00.000Z",
    "expiresAt": "2026-04-26T08:11:00.000Z"
  }
}
```

## Device Polling

```text
GET /api/device/stream-state?stationId={STATION_ID}
Authorization: Bearer {DEVICE_TOKEN}
```

The Arduino polls roughly once per second. If `stream.active` is false, it does not upload frames.

## Device Frame Upload

```text
POST /api/device/stream-frames
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: application/json
```

Payload:

```json
{
  "stationId": "collserola-control-02",
  "capturedAt": "2026-04-26T08:10:01.000Z",
  "contentType": "image/jpeg",
  "encoding": "base64",
  "data": "/9j/4AAQSkZJRgABAQAAAQABAAD...",
  "boundingBoxesEnabled": true,
  "frameWidth": 640,
  "frameHeight": 360,
  "boxes": [
    {
      "label": "0",
      "confidence": 0.91,
      "x": 212,
      "y": 96,
      "width": 118,
      "height": 84
    }
  ]
}
```

Rules:

```text
format: JPEG
encoding: base64
max decoded frame size: 750 KB
default requested rate: 2 fps
session TTL: 60 seconds, refreshed by dashboard keepalive
storage: in memory only
```

If Button B is enabled on the Arduino, the Python app sends bounding-box metadata with the raw JPEG frame. The dashboard draws the visual boxes as a lightweight overlay. The server does not run inference or draw boxes.

## Realtime Events

```text
stream.session.updated
stream.frame
```

`stream.frame` carries a data URL for the latest JPEG so the dashboard can render it immediately without an additional HTTP image request.

## Demo Troubleshooting

- If the viewer says `Waiting`, the dashboard session is active but the Arduino has not uploaded a frame yet.
- If it says `Stale`, the server received a frame but has not received another one for several seconds.
- If it says `Closed`, the stream session expired or the viewer was closed.
- The stream is independent from detection arming. `Listen from device` controls accepted detection events, while the camera icon controls frame upload.
- `SERVER_URL`, `DEVICE_TOKEN`, and `STATION_ID` are code constants in `guaita-arduino/python/main.py` for hackathon speed.
