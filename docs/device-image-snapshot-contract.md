# Device Image Snapshot Contract

Status: planned v2, not required for the current MVP.

## Goal

After a station detects a wild boar, it may upload one still image snapshot linked to the detection event. The dashboard can then show the snapshot in the event or alert panel.

Image upload must remain optional. A detection event is valid and useful even when no image is uploaded.

## Design Principle

Send metadata first, image second.

```text
1. Device detects boar locally.
2. Device sends JSON detection event.
3. Server returns `eventId`.
4. Device optionally uploads one JPEG snapshot for that `eventId`.
5. Server stores the image and updates the event with `imageUrl`.
6. Dashboard receives an update and renders the snapshot.
```

Do not send base64 images inside the detection JSON. Do not stream video for the MVP/v2 snapshot path.

## Step 1: Detection Event

```text
POST {SERVER_URL}/api/device/events
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: application/json
```

Example:

```json
{
  "stationId": "live-device-01",
  "source": "device",
  "species": "wild_boar",
  "confidence": 0.91,
  "direction": "towards_city"
}
```

Response:

```json
{
  "ok": true,
  "eventId": "evt_device_m3abc123_d4e5f6a7",
  "severity": "high",
  "event": {
    "eventId": "evt_device_m3abc123_d4e5f6a7",
    "stationId": "live-device-01",
    "observedAt": "2026-04-25T10:42:12.000Z",
    "source": "device",
    "species": "wild_boar",
    "confidence": 0.91,
    "count": 1,
    "direction": "towards_city"
  }
}
```

## Step 2: Snapshot Upload

```text
POST {SERVER_URL}/api/device/events/{eventId}/snapshot
Authorization: Bearer {DEVICE_TOKEN}
Content-Type: image/jpeg
```

Body: raw JPEG bytes.

Example:

```bash
curl -X POST https://uncordial-mathias-infirmly.ngrok-free.dev/api/device/events/evt_device_m3abc123_d4e5f6a7/snapshot \
  -H "Authorization: Bearer ${DEVICE_TOKEN}" \
  -H "Content-Type: image/jpeg" \
  --data-binary @snapshot.jpg
```

Expected response:

```json
{
  "ok": true,
  "eventId": "evt_device_m3abc123_d4e5f6a7",
  "imageUrl": "/api/events/evt_device_m3abc123_d4e5f6a7/snapshot"
}
```

## Step 3: Snapshot Read

```text
GET {SERVER_URL}/api/events/{eventId}/snapshot
```

Response:

```text
Content-Type: image/jpeg
```

Body: raw JPEG bytes.

## Server Behavior

The server should:

- require the same `DEVICE_TOKEN` bearer auth for upload as for detection events
- reject unknown `eventId`
- reject snapshots for events whose `source` is not `device`, unless explicitly allowed later
- limit file size, initially around `1-2MB`
- accept only `image/jpeg` for the first version
- store images locally under `data/event-images/`
- update the event `imageUrl`
- broadcast a realtime update such as `detection.snapshot_attached`

Suggested storage path:

```text
data/event-images/{eventId}.jpg
```

Suggested public URL:

```text
/api/events/{eventId}/snapshot
```

## Frontend Behavior

The dashboard should:

- keep rendering the detection immediately after metadata arrives
- show a loading or empty snapshot state if no image exists yet
- update the event panel when `imageUrl` becomes available
- render a small thumbnail first
- allow opening a larger preview later if useful

The map should not depend on image upload.

## Device Behavior

The device sender should:

- send metadata first
- upload one snapshot only if the metadata request succeeds
- use the `eventId` returned by the server
- compress or resize the JPEG before upload
- skip image upload if connectivity is poor
- never block local detection on image upload

Recommended image constraints:

```text
format: JPEG
max size: 1-2MB
suggested width: 640-1280px
upload count: 1 snapshot per detection event
```

## Python Example

```python
import json
import requests

SERVER_URL = "https://uncordial-mathias-infirmly.ngrok-free.dev"
DEVICE_TOKEN = "demo-device-token"
STATION_ID = "live-device-01"

def send_detection_with_snapshot(confidence: float, snapshot_path: str):
    event_response = requests.post(
        f"{SERVER_URL}/api/device/events",
        headers={
            "Authorization": f"Bearer {DEVICE_TOKEN}",
            "Content-Type": "application/json"
        },
        data=json.dumps({
            "stationId": STATION_ID,
            "source": "device",
            "species": "wild_boar",
            "confidence": confidence
        }),
        timeout=5
    )
    event_response.raise_for_status()
    event = event_response.json()
    event_id = event["eventId"]

    with open(snapshot_path, "rb") as snapshot_file:
        snapshot_response = requests.post(
            f"{SERVER_URL}/api/device/events/{event_id}/snapshot",
            headers={
                "Authorization": f"Bearer {DEVICE_TOKEN}",
                "Content-Type": "image/jpeg"
            },
            data=snapshot_file,
            timeout=10
        )
    snapshot_response.raise_for_status()
    return {
        "event": event,
        "snapshot": snapshot_response.json()
    }
```

## Rejected Alternatives

Base64 in detection JSON:

- easier to prototype
- bloats JSON payloads
- makes validation and logging noisy
- increases chance of failed detection ingestion

Multipart event plus image:

- reasonable later
- more complex than the two-step flow
- makes the detection event depend on image upload success

Video streaming:

- out of scope
- too bandwidth-heavy for the demo architecture
- conflicts with the edge-first metadata approach
