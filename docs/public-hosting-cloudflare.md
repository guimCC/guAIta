# Public Hosting With Cloudflare

## Goal

Expose a public, read-only guAIta status page at `https://guaita.biz` and keep the live demo backend reachable at `https://api.guaita.biz`.

This setup is intended for the hackathon demo:

- `guaita.biz`: public population-facing status page hosted by Cloudflare Pages.
- `www.guaita.biz`: redirect or alias to `guaita.biz`.
- `api.guaita.biz`: Cloudflare Tunnel to the local Fastify server on port `3000`.
- `ops.guaita.biz`: optional later hostname for the operator dashboard.

The public page should show aggregated status only. Do not expose exact raw device data, exact station coordinates beyond what is intended for public display, or write endpoints from the public UI.

## Cloudflare Account And DNS

1. Create or open a Cloudflare account.
2. Add `guaita.biz` as a website.
3. Choose the Free plan.
4. Let Cloudflare scan existing DNS records.
5. Before changing nameservers, copy or screenshot the existing DNS records at the current registrar/DNS provider.
6. At the domain registrar, replace the current nameservers with the two Cloudflare nameservers shown in the Cloudflare dashboard.
7. If DNSSEC is enabled at the registrar, disable the old DS record before the nameserver switch or update DNSSEC after Cloudflare is authoritative.
8. Wait until Cloudflare marks `guaita.biz` as active.

Cloudflare requires full nameserver setup for Free plan apex-domain features. This means the registrar must delegate `guaita.biz` to Cloudflare nameservers.

## Pages Frontend

Use Cloudflare Pages for the static React app.

1. In Cloudflare, go to `Workers & Pages`.
2. Select `Create application`.
3. Select `Pages`.
4. Select `Import an existing Git repository`.
5. Connect the GitHub repository:

```text
guimCC/guAIta
```

6. Use these build settings:

```text
Production branch: main
Root directory: /
Build command: npm run build -w @guaita/web
Build output directory: apps/web/dist
Node.js version: 22
```

7. Add production environment variables:

```text
VITE_API_BASE_URL=https://api.guaita.biz
VITE_SOCKET_URL=https://api.guaita.biz
VITE_MAPTILER_KEY=<team MapTiler key, if using MapTiler>
VITE_MAPTILER_STYLE_ID=outdoor-v4
VITE_MAP_FALLBACK_STYLE_URL=https://tiles.openfreemap.org/styles/liberty
VITE_MAP_CENTER_LAT=41.4197
VITE_MAP_CENTER_LNG=2.1029
VITE_MAP_INITIAL_ZOOM=12.2
```

8. Deploy once.
9. After the first deploy succeeds, open the Pages project and add custom domains:

```text
guaita.biz
www.guaita.biz
```

For `www.guaita.biz`, either attach it as another custom domain or create a redirect to the apex domain.

## Tunnel Backend

Use Cloudflare Tunnel to expose the local Fastify server without opening router ports.

1. In Cloudflare, go to `Zero Trust`.
2. If prompted, create the Zero Trust organization.
3. Go to `Networks` -> `Tunnels`.
4. Select `Create Tunnel`.
5. Choose a Cloudflare Tunnel connector.
6. Name the tunnel:

```text
guaita-demo-api
```

7. Select the local machine OS and architecture.
8. Run the install/connect command shown by Cloudflare on the machine running the backend.
9. Add a published application route:

```text
Subdomain: api
Domain: guaita.biz
Service type: HTTP
Service URL: localhost:3000
```

10. Save the route.
11. Keep `cloudflared` running during the demo.

The backend must be running locally for the tunnel to work:

```bash
npm run dev -w @guaita/server
```

or, if the whole app is needed locally:

```bash
npm run dev
```

## Backend Environment For Demo

When using `api.guaita.biz`, set the local `.env` values to:

```env
PUBLIC_BASE_URL=https://api.guaita.biz
PUBLIC_TUNNEL_URL=https://api.guaita.biz
CORS_ORIGIN=https://guaita.biz,https://www.guaita.biz,http://localhost:5173
DEVICE_TOKEN=<shared demo device token>
```

Restart the backend after changing `.env`.

The Arduino/UNO Q sender should use:

```json
{
  "serverUrl": "https://api.guaita.biz",
  "deviceToken": "same value as DEVICE_TOKEN in .env",
  "stationId": "live-device-01"
}
```

## Verification Checklist

Run these checks before the demo.

1. Domain is active in Cloudflare:

```bash
dig +short NS guaita.biz
```

The answer should be Cloudflare nameservers.

2. Public frontend loads:

```text
https://guaita.biz
https://www.guaita.biz
```

3. Backend health works through the tunnel:

```bash
curl https://api.guaita.biz/health
```

4. Device ingestion works through the tunnel:

```bash
set -a
source .env
set +a

curl -X POST https://api.guaita.biz/api/device/events \
  -H "Authorization: Bearer $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "evt_cloudflare_demo_test",
    "stationId": "live-device-01",
    "observedAt": "2026-04-25T10:42:12.000Z",
    "source": "device",
    "species": "wild_boar",
    "confidence": 0.91
  }'
```

5. Browser receives realtime updates from `https://api.guaita.biz`.
6. The public page does not expose secret tokens or unsafe write controls.

## Demo Operating Rule

For the hackathon, keep Cloudflare Pages deployed and keep the local backend plus `cloudflared` running on the presentation laptop. If the Wi-Fi changes, the public hostnames stay the same because Cloudflare Tunnel reconnects outbound from the laptop.
