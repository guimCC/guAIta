# Device Live Stream Contract

Status: implemented for the demo path.

## Goal

Allow the dashboard operator to open a compact live camera viewer for a station. The Arduino UNO Q does not accept inbound browser or server connections. Instead, it polls the server for an active stream session and uploads low-rate JPEG or PNG frames while the session is active.

This keeps the demo reliable through localhost, ngrok, or another public tunnel.

## Flow

```text
1. Operator presses a station camera icon in the dashboard.
2. Dashboard POSTs /api/streams/{stationId}/start.
3. Server stores an in-memory stream session for that station and broadcasts stream.session.updated.
4. Arduino polls /api/device/stream-state?stationId={stationId}.
5. If active, Arduino opens one persistent upload to /api/device/stream-frames/pipe and writes image frame parts at the requested interval.
6. Server validates each frame and writes it to the dashboard's multipart image stream.
7. Socket.IO broadcasts stream.frame metadata only, so the dashboard can update live/stale state and bounding-box overlays without moving image bytes through React state.
8. Closing the viewer POSTs /api/streams/{stationId}/stop.
```

## Dashboard Endpoints

```text
POST /api/streams/{stationId}/start
POST /api/streams/{stationId}/stop
GET  /api/streams/{stationId}
GET  /api/streams/{stationId}/image-stream
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
POST /api/device/stream-frames/pipe?stationId={STATION_ID}
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: multipart/x-mixed-replace; boundary=guaita-upload-frame
```

Body: a long-lived multipart image stream. Each part is a JPEG or PNG frame. The Python sender attempts to convert PNG bytes to a smaller JPEG first when Pillow is installed; otherwise it sends the original PNG. The server still sniffs the actual image signature.

Part headers:

```text
--guaita-upload-frame
Content-Type: image/jpeg
Content-Length: 48321
X-Guaita-Captured-At: 2026-04-26T08:10:01.000Z
X-Guaita-Bounding-Boxes-Enabled: false
X-Guaita-Frame-Width: 640
X-Guaita-Frame-Height: 360

<raw image bytes>
```

Optional header when Button B is enabled:

```text
X-Guaita-Boxes: [{"label":"0","confidence":0.91,"x":212,"y":96,"width":118,"height":84}]
```

The single-frame raw endpoint remains accepted as a fallback:

```text
POST /api/device/stream-frames/raw?stationId={STATION_ID}&capturedAt={ISO_TIME}&boundingBoxesEnabled=false
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: image/jpeg or image/png
```

Legacy JSON/base64 upload remains accepted at `/api/device/stream-frames`, but the Arduino app uses the persistent pipe for lower latency.

Legacy JSON payload shape:

```json
{
  "stationId": "collserola-control-02",
  "capturedAt": "2026-04-26T08:10:01.000Z",
  "contentType": "image/png",
  "encoding": "base64",
  "data": "iVBORw0KGgoAAAANSUhEUgAA...",
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
format: JPEG preferred, PNG accepted
encoding: multipart raw image bytes on the primary endpoint
max decoded frame size: 750 KB
default requested rate: 2 fps
session TTL: 60 seconds, refreshed by dashboard keepalive
storage: in memory only
```

If Button B is enabled on the Arduino, the Python app sends bounding-box metadata with each image part. The dashboard draws the visual boxes as a lightweight overlay. The server does not run inference or draw boxes.

## Realtime Events

```text
stream.session.updated
stream.frame
```

`stream.frame` carries metadata only. Image bytes go through `GET /api/streams/{stationId}/image-stream` as `multipart/x-mixed-replace` parts, with each part labeled `image/jpeg` or `image/png`.

## Demo Troubleshooting

- If the viewer says `Waiting`, the dashboard session is active but the Arduino has not uploaded a frame yet.
- If server logs only show `/api/device/stream-state`, the device is polling correctly but no upload pipe has opened yet.
- If frame uploads return `400 invalid_stream_frame`, check whether the camera bytes are JPEG or PNG and that each part body is raw image bytes, not base64.
- For best demo latency, install Pillow on the Arduino Python environment and let the sender convert camera PNGs to JPEG: `python3 -m pip install Pillow`.
- If it says `Stale`, the server received a frame but has not received another one for several seconds.
- If it says `Closed`, the stream session expired or the viewer was closed.
- The stream is independent from detection arming. `Listen from device` controls accepted detection events, while the camera icon controls frame upload.
- `SERVER_URL`, `DEVICE_TOKEN`, and `STATION_ID` are code constants in `guaita-arduino/python/main.py` for hackathon speed.
