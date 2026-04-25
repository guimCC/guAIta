# Local Development

## Setup

Install dependencies from the repo root:

```bash
npm install
```

Create local environment config:

```bash
cp .env.example .env
```

Fill in local-only values in `.env`, especially:

```env
VITE_MAPTILER_KEY=your_maptiler_key
DEVICE_TOKEN=your_shared_device_token
PUBLIC_BASE_URL=https://uncordial-mathias-infirmly.ngrok-free.dev
PUBLIC_TUNNEL_URL=https://uncordial-mathias-infirmly.ngrok-free.dev
```

Do not commit `.env`.

## Main Commands

Run the full development stack:

```bash
npm run dev
```

This builds the shared package once, then starts:

- backend on `http://localhost:3000`
- frontend on `http://localhost:5173`

In development, the backend clears stored runtime demo state on startup by default (`DEMO_RESET_ON_START=true`) and starts with device detections disarmed (`DEVICE_EVENTS_ENABLED_ON_START=false`). Arm **Listen from device** in the dashboard only when you are ready for the live Arduino detection; the backend auto-disarms after one accepted device event or after `DEVICE_EVENTS_ARM_TTL_MS`.

Typecheck all packages:

```bash
npm run typecheck
```

Build all packages:

```bash
npm run build
```

Reset a running demo without restarting the backend:

```bash
npm run reset-demo
```

If the backend is not on `http://localhost:3000`, pass the base URL:

```bash
npm run reset-demo -- http://localhost:3001
```

## Package-Specific Commands

Run only the backend:

```bash
npm run dev -w @guaita/server
```

Run only the frontend:

```bash
npm run dev -w @guaita/web
```

Build the shared package:

```bash
npm run build -w @guaita/shared
```

Start the built backend after `npm run build`:

```bash
npm run start -w @guaita/server
```

Preview the built frontend:

```bash
npm run preview -w @guaita/web
```

## Health Check

With the backend running:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{
  "ok": true,
  "service": "guaita-server",
  "time": "..."
}
```

## ngrok Tunnel

Use ngrok when the Arduino UNO Q needs to reach the local backend over the public internet.

Start the backend first:

```bash
npm run dev
```

Then, in another terminal, start the static ngrok tunnel:

```bash
ngrok http --url=https://uncordial-mathias-infirmly.ngrok-free.dev 3000
```

Verify the public health endpoint:

```bash
curl https://uncordial-mathias-infirmly.ngrok-free.dev/health
```

The Arduino sender should use:

```json
{
  "serverUrl": "https://uncordial-mathias-infirmly.ngrok-free.dev",
  "deviceToken": "same value as DEVICE_TOKEN in .env",
  "stationId": "collserola-control-02"
}
```

## Device Event Test

With the backend running, test the device ingestion route locally:

```bash
set -a
source .env
set +a

curl -X PUT http://localhost:3000/api/device/listening \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

curl -X POST http://localhost:3000/api/device/events \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_local_test",
    "stationId": "collserola-control-02",
    "observedAt": "2026-04-25T10:42:12.000Z",
    "source": "device",
    "species": "wild_boar",
    "confidence": 0.91
  }'
```

For the public tunnel, replace the host with:

```text
https://uncordial-mathias-infirmly.ngrok-free.dev
```

## Notes

- The frontend map uses MapTiler Outdoor v4 when `VITE_MAPTILER_KEY` is set.
- Without a MapTiler key, the map falls back to OpenFreeMap Liberty.
- SQLite data is written under `data/` by default.
- `.env` and local database files are intentionally ignored by git.
