# Device Contract

## Purpose

This document defines how the Arduino UNO Q or any simulator sends detection events and telemetry readings to the guAIta server.

The same contract must be used by:

- real Arduino/UNO Q sender
- local simulator
- manual dashboard controls
- scripted scenarios

## Transport

Use HTTP POST with JSON.

```text
POST {SERVER_URL}/api/device/events
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: application/json
```

The server URL should come from config or environment variables, not from hardcoded compiled code.

## Recommended Device Config

```json
{
  "serverUrl": "https://uncordial-mathias-infirmly.ngrok-free.dev",
  "deviceToken": "demo-device-token",
  "stationId": "collserola-control-02"
}
```

If the tunnel URL changes, update this config and restart the sender process. Do not recompile the vision model or firmware just to change the server URL.

## Endpoint

Production/demo tunnel:

```text
POST https://uncordial-mathias-infirmly.ngrok-free.dev/api/device/events
```

Local development:

```text
POST http://localhost:3000/api/device/events
```

Required headers:

```text
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: application/json
```

## Telemetry Endpoint

Stations may report environmental and device-health readings even when no wild boar is detected.

Production/demo tunnel:

```text
POST https://uncordial-mathias-infirmly.ngrok-free.dev/api/device/telemetry
```

Local development:

```text
POST http://localhost:3000/api/device/telemetry
```

Use the same authorization and content-type headers as detection events.

Minimum telemetry payload:

```json
{
  "stationId": "collserola-control-02",
  "source": "device",
  "temperatureC": 17.4
}
```

Full telemetry payload:

```json
{
  "telemetryId": "tel_live_device_001",
  "stationId": "collserola-control-02",
  "observedAt": "2026-04-25T10:42:00.000Z",
  "source": "device",
  "temperatureC": 17.4,
  "humidityPct": 68,
  "lightLux": 310,
  "batteryPct": 82,
  "rssiDbm": -64
}
```

At least one reading field is required. If `telemetryId` or `observedAt` are missing, the server may generate them.
Sensor reading fields may be `null`; the server treats `null` as unavailable and does not store that field.

Expected telemetry response:

```json
{
  "ok": true,
  "telemetryId": "tel_live_device_001",
  "telemetry": {
    "telemetryId": "tel_live_device_001",
    "stationId": "collserola-control-02",
    "observedAt": "2026-04-25T10:42:00.000Z",
    "source": "device",
    "temperatureC": 17.4,
    "humidityPct": 68,
    "lightLux": 310,
    "batteryPct": 82,
    "rssiDbm": -64
  }
}
```

If every sensor reading field is missing or `null`, the server accepts the request but skips storage:

```json
{
  "ok": true,
  "ignored": true,
  "reason": "no_telemetry_values"
}
```

## Live Stream Endpoints

The dashboard can request low-rate live camera frames from a station. The Arduino does not expose an inbound stream. It polls the server for stream state and uploads JPEG or PNG frames only while a dashboard session is active.

Device polling:

```text
GET {SERVER_URL}/api/device/stream-state?stationId={STATION_ID}
Authorization: Bearer {DEVICE_TOKEN}
```

Primary frame upload:

```text
POST {SERVER_URL}/api/device/stream-frames/pipe?stationId={STATION_ID}
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: multipart/x-mixed-replace; boundary=guaita-upload-frame
```

Body: a persistent multipart stream of raw image parts. JPEG is preferred; PNG is accepted. The Arduino Python sender attempts to convert PNG bytes to smaller JPEG frames when Pillow is installed.

Fallback single-frame upload:

```text
POST {SERVER_URL}/api/device/stream-frames/raw?stationId={STATION_ID}
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: image/jpeg or image/png
```

Body: raw JPEG or PNG bytes. The server sniffs the actual image signature before relaying it to the dashboard image stream.

The dashboard renders frames through `GET /api/streams/{stationId}/image-stream`, a multipart image stream consumed directly by the browser image element. Socket.IO carries stream status and bounding-box metadata only.

The server still accepts the older JSON/base64 endpoint at `/api/device/stream-frames`, but the Arduino app uses the persistent pipe for lower latency.

Legacy JSON payload:

```json
{
  "stationId": "collserola-control-02",
  "capturedAt": "2026-04-26T08:10:01.000Z",
  "contentType": "image/png",
  "encoding": "base64",
  "data": "iVBORw0KGgoAAAANSUhEUgAA...",
  "boundingBoxesEnabled": false,
  "boxes": []
}
```

See [Device Live Stream Contract](device-live-stream-contract.md) for limits and session behavior.

## Minimum Payload

This is enough for the hardware team to start sending real detections:

```json
{
  "stationId": "collserola-control-02",
  "source": "device",
  "species": "wild_boar",
  "confidence": 0.91
}
```

If `eventId` or `observedAt` are missing, the server may generate them.

## Full Payload

```json
{
  "eventId": "evt_live_device_001",
  "stationId": "collserola-control-02",
  "observedAt": "2026-04-25T10:42:12.000Z",
  "source": "device",
  "species": "wild_boar",
  "confidence": 0.91,
  "count": 1,
  "direction": "towards_city",
  "temperatureC": 17.4,
  "humidityPct": 68,
  "lightLux": 310,
  "batteryPct": 82,
  "model": {
    "name": "wild-boar-detector",
    "version": "demo-v1",
    "latencyMs": 143
  },
  "snapshot": {
    "contentType": "image/png",
    "encoding": "base64",
    "data": "iVBORw0KGgoAAAANSUhEUg..."
  }
}
```

## Field Notes

- `eventId`: optional. Generated by the device when possible. The server may generate one if missing.
- `stationId`: identifies the physical or simulated station.
- `observedAt`: optional. ISO timestamp for when the detection happened on the source side.
- `source`: must be `device` for real Arduino/UNO Q events.
- `species`: must be `wild_boar` for the MVP.
- `confidence`: value from `0` to `1`.
- `count`: optional positive integer. Defaults to `1`.
- `direction`: optional movement estimate such as `towards_city`, `towards_forest`, `left_to_right`, or `unknown`.
- `snapshot`: optional JPEG or PNG snapshot encoded as base64 in the same JSON request. See [Device Image Snapshot Contract](device-image-snapshot-contract.md).
- `imageUrl`: server-generated URL returned when a snapshot is accepted. The device should not send this field.
- live frames: separate from detection snapshots. Frames are uploaded only to `/api/device/stream-frames/pipe` or `/api/device/stream-frames/raw` while a dashboard stream session is active.
- `temperatureC`: optional temperature reading.
- `humidityPct`: optional humidity reading from `0` to `100`.
- `lightLux`: optional non-negative light reading.
- `batteryPct`: optional battery percentage from `0` to `100`.
- `rssiDbm`: optional radio signal strength in dBm, used only by telemetry readings.
- `model`: optional local model metadata.

## Allowed Values

```text
source: device
species: wild_boar
direction: towards_city | towards_forest | left_to_right | right_to_left | unknown
```

## Current Station IDs

Use this first for the physical Arduino UNO Q demo device:

```text
collserola-control-02
```

For hackathon speed, `SERVER_URL`, `DEVICE_TOKEN`, and `STATION_ID` are currently code constants in `guaita-arduino/python/main.py`.

Other seeded stations currently available for simulation/demo work:

```text
forest-control-01
frontier-gate-01
containment-west-01
urban-edge-01
```

## Example curl

```bash
curl -X POST https://uncordial-mathias-infirmly.ngrok-free.dev/api/device/events \
  -H "Authorization: Bearer ${DEVICE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "stationId": "collserola-control-02",
    "source": "device",
    "species": "wild_boar",
    "confidence": 0.91,
    "direction": "towards_city",
    "temperatureC": 17.4,
    "humidityPct": 68
  }'
```

## Expected Server Response

```json
{
  "ok": true,
  "eventId": "evt_live_device_001",
  "severity": "high",
  "event": {
    "eventId": "evt_live_device_001",
    "stationId": "collserola-control-02",
    "observedAt": "2026-04-25T10:42:12.000Z",
    "source": "device",
    "species": "wild_boar",
    "confidence": 0.91,
    "count": 1,
    "direction": "towards_city",
    "imageUrl": "https://uncordial-mathias-infirmly.ngrok-free.dev/api/events/evt_live_device_001/snapshot"
  }
}
```

Possible error responses:

```json
{
  "ok": false,
  "error": "unauthorized"
}
```

```json
{
  "ok": false,
  "error": "invalid_detection_event"
}
```

```json
{
  "ok": false,
  "error": "unknown_station",
  "stationId": "some-station-id"
}
```

```json
{
  "ok": false,
  "error": "duplicate_event",
  "eventId": "evt_live_device_001"
}
```

## Sender Guidance

For the UNO Q, prefer a small Linux-side Python sender process that reads config and posts JSON. The vision process can call this sender or write detections to a local queue/file.

Preferred flow:

```text
camera frame
-> local edge inference
-> detection metadata
-> HTTP sender reads config
-> POST to server
```

Do not stream all video to the server for the MVP. Send compact metadata and, when useful, one small still image snapshot.

For optional inline snapshot details, see [Device Image Snapshot Contract](device-image-snapshot-contract.md).

## Python Sender Example

```python
import json
import time
import requests

SERVER_URL = "https://uncordial-mathias-infirmly.ngrok-free.dev"
DEVICE_TOKEN = "demo-device-token"
STATION_ID = "collserola-control-02"

def send_detection(confidence: float):
    payload = {
        "stationId": STATION_ID,
        "source": "device",
        "species": "wild_boar",
        "confidence": confidence,
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "model": {
            "name": "wild-boar-detector",
            "version": "demo-v1"
        }
    }

    response = requests.post(
        f"{SERVER_URL}/api/device/events",
        headers={
            "Authorization": f"Bearer {DEVICE_TOKEN}",
            "Content-Type": "application/json"
        },
        data=json.dumps(payload),
        timeout=5
    )
    response.raise_for_status()
    return response.json()

def send_telemetry(temperature_c: float, humidity_pct: float):
    payload = {
        "stationId": STATION_ID,
        "source": "device",
        "observedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "temperatureC": temperature_c,
        "humidityPct": humidity_pct
    }

    response = requests.post(
        f"{SERVER_URL}/api/device/telemetry",
        headers={
            "Authorization": f"Bearer {DEVICE_TOKEN}",
            "Content-Type": "application/json"
        },
        data=json.dumps(payload),
        timeout=5
    )
    response.raise_for_status()
    return response.json()
```

## Hardware Team Checklist

- Read `serverUrl`, `deviceToken`, and `stationId` from config.
- Send HTTP JSON to `/api/device/events`.
- Send periodic sensor JSON to `/api/device/telemetry` when readings are available.
- Use `source: "device"`.
- Send only metadata plus an optional small JPEG or PNG snapshot, not video.
- Keep `confidence` between `0` and `1`.
- Include telemetry if available, but do not block on it.
- Retry later if the network call fails; do not block local detection.
