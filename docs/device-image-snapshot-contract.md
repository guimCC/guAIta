# Device Image Snapshot Contract

Status: implemented for the demo path.

## Goal

After a station detects a wild boar, the Arduino/UNO Q sender may include one still JPEG or PNG snapshot in the same detection JSON request. The dashboard then shows a camera icon on that detection; opening the icon loads the stored image in a new browser page.

Image data is optional. A detection event remains valid when no snapshot is available.

## Design Principle

Use one outbound request from the device.

```text
1. Device detects boar locally.
2. Device builds the normal detection JSON.
3. Device optionally adds `snapshot` with base64 image bytes.
4. Device POSTs the JSON to `/api/device/events`.
5. Server generates `eventId`, stores metadata, stores the image, and sets `imageUrl`.
6. Dashboard receives `detection.created` with `imageUrl` already present.
```

The device does not need to generate an event ID, listen for server events, or make a second upload request.

## Endpoint

```text
POST {SERVER_URL}/api/device/events
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: application/json
```

Minimum event with snapshot:

```json
{
  "stationId": "collserola-control-02",
  "source": "device",
  "species": "wild_boar",
  "confidence": 0.91,
  "observedAt": "2026-04-25T10:42:12.000Z",
  "snapshot": {
    "contentType": "image/png",
    "encoding": "base64",
    "data": "iVBORw0KGgoAAAANSUhEUg..."
  }
}
```

If no photo is available, omit `snapshot` or send it as `null`.

## Snapshot Rules

```text
format: JPEG or PNG
encoding: base64
max decoded image size: 1 MB
recommended width: 320-640px for demo reliability
field: snapshot.data contains raw base64, not a filename
```

The server accepts `data:image/jpeg;base64,...` and `data:image/png;base64,...` prefixes, but the preferred device payload is only the base64 bytes.
The backend detects the real image format from the decoded bytes, so PNG bytes can still be accepted even if a device mistakenly sends `contentType: "image/jpeg"`.

## Expected Response

When the snapshot is valid:

```json
{
  "ok": true,
  "eventId": "evt_device_m3abc123_d4e5f6a7",
  "severity": "high",
  "event": {
    "eventId": "evt_device_m3abc123_d4e5f6a7",
    "stationId": "collserola-control-02",
    "observedAt": "2026-04-25T10:42:12.000Z",
    "source": "device",
    "species": "wild_boar",
    "confidence": 0.91,
    "count": 1,
    "imageUrl": "https://your-demo-domain/api/events/evt_device_m3abc123_d4e5f6a7/snapshot"
  }
}
```

The raw `snapshot.data` is never stored inside the event JSON response.

## Snapshot Read

```text
GET {SERVER_URL}/api/events/{eventId}/snapshot
```

Response:

```text
Content-Type: image/jpeg or image/png
```

Body: raw image bytes.

## Server Behavior

The server:

- validates the normal detection fields
- generates `eventId` when the device omits it
- decodes `snapshot.data` when present
- rejects snapshots that are not JPEG or PNG
- rejects snapshots larger than 1 MB decoded
- stores images locally under `data/event-images/`
- stores event JSON without raw image bytes
- sets `event.imageUrl`
- emits the normal `detection.created` event with `imageUrl`

Suggested storage path:

```text
data/event-images/{encoded-event-id}.jpg
data/event-images/{encoded-event-id}.png
```

Public image URL:

```text
/api/events/{eventId}/snapshot
```

## Frontend Behavior

The dashboard:

- keeps rendering detections without photos
- shows a camera icon only when `event.imageUrl` exists
- opens the snapshot in a new browser page when the operator presses the icon

## Python Example

```python
import base64
import json
import requests

SERVER_URL = "https://your-demo-domain"
DEVICE_TOKEN = "demo-device-token"
STATION_ID = "collserola-control-02"

def send_detection_with_snapshot(confidence: float, snapshot_path: str):
    with open(snapshot_path, "rb") as snapshot_file:
        snapshot_base64 = base64.b64encode(snapshot_file.read()).decode("utf-8")

    response = requests.post(
        f"{SERVER_URL}/api/device/events",
        headers={
            "Authorization": f"Bearer {DEVICE_TOKEN}",
            "Content-Type": "application/json"
        },
        data=json.dumps({
            "stationId": STATION_ID,
            "source": "device",
            "species": "wild_boar",
            "confidence": confidence,
            "snapshot": {
                "contentType": "image/png",
                "encoding": "base64",
                "data": snapshot_base64
            }
        }),
        timeout=10
    )
    response.raise_for_status()
    return response.json()
```

## Tradeoff

Base64 inside JSON is less efficient than a binary upload, but it is the simplest demo contract because the device only needs one outbound HTTP JSON request.
