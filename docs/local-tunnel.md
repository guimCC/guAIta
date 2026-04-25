# Local Tunnel

## Goal

Expose the local guAIta server to the Arduino UNO Q without deploying the backend during development or demo rehearsal.

## Recommended Approach

Use ngrok with a static/free dev domain when available.

```bash
ngrok http --url=https://your-static-domain.ngrok-free.app 3000
```

For the current guAIta static dev domain:

```bash
ngrok http --url=https://uncordial-mathias-infirmly.ngrok-free.dev 3000
```

Depending on the installed ngrok version, the equivalent flag may be:

```bash
ngrok http --domain=your-static-domain.ngrok-free.app 3000
```

## Device Configuration

The device sender should read the server URL from config:

```json
{
  "serverUrl": "https://uncordial-mathias-infirmly.ngrok-free.dev",
  "deviceToken": "demo-device-token",
  "stationId": "collserola-control-02"
}
```

This avoids recompiling code when the tunnel changes.

## Fallbacks

If ngrok is unavailable:

- Use the laptop LAN IP if the device is on the same network.
- Use Cloudflare Tunnel.
- Deploy the Docker image to a simple container host.

## Demo Rule

Before the final demo, verify:

- `/health` is reachable through the public tunnel.
- `POST /api/device/events` works from another network.
- the dashboard receives realtime Socket.IO events through the tunnel.
- the Arduino sender has the current `serverUrl` and `deviceToken`.
