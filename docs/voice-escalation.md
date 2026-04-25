# Voice Escalation Demo

guAIta can store a Civil Protection escalation call for an operator-selected detection and, when configured, place the outbound call through an ElevenLabs agent connected to Twilio.

## Demo Flow

1. A device, scenario, or manual detection is stored.
2. The dashboard operator clicks **Call Civil Protection**.
3. The server creates a call record in SQLite.
4. If `CALLS_ENABLED=true`, the server starts an ElevenLabs outbound call.
5. ElevenLabs receives incident context as dynamic variables.
6. If the recipient acknowledges the incident, the agent calls the acknowledgement webhook.
7. The dashboard receives `call.updated` over Socket.IO and marks the alert as acknowledged.
8. The ElevenLabs post-call webhook stores the transcript summary and final call state.

## Environment

```bash
CALLS_ENABLED=true
CIVIL_PROTECTION_DEMO_NUMBER=+34YOUR_RECIPIENT_NUMBER
ELEVENLABS_API_KEY=...
ELEVENLABS_AGENT_ID=...
ELEVENLABS_AGENT_PHONE_NUMBER_ID=...
ELEVENLABS_WEBHOOK_TOKEN=shared-demo-token
PUBLIC_TUNNEL_URL=https://your-public-ngrok-or-cloudflare-url
```

Keep `CALLS_ENABLED=false` while testing the dashboard-only flow. The server will store the call request but will not place a real outbound call.

## ElevenLabs Agent

Create one reusable agent. The backend sends dynamic variables for the current incident, including:

- `call_id`
- `incident_id`
- `inciden_id` (temporary compatibility alias for a typo in the ElevenLabs tool UI)
- `station_name`
- `severity`
- `confidence`
- `source`
- `location_name`
- `coordinates`
- `current_pattern`
- `normal_pattern`
- `risk_reason`
- `recommended_action`
- `acknowledge_callback_url`

Suggested agent instruction:

```text
You are guAIta, an automated forest-risk escalation assistant.

You are calling a Civil Protection demo operator about one active incident.
Start by saying this is a guAIta demo escalation call. Summarize the species,
severity, station, confidence, source device, location, unusual pattern, and
recommended action.

Answer questions only from the supplied incident variables. If something is not
available, say it is not available in the current alert packet.

Before ending, ask whether Civil Protection acknowledges the alert and will send
a team. If the operator confirms, call the acknowledgement webhook with call_id,
incident_id, outcome, and notes.

After the acknowledgement tool succeeds, say that the alert has been marked as
handled, thank the operator, and call the ElevenLabs `end_call` system tool.
```

## Webhooks

Configure an ElevenLabs server tool for acknowledgement:

```text
POST {PUBLIC_TUNNEL_URL}/api/calls/civil-protection/acknowledge?token={ELEVENLABS_WEBHOOK_TOKEN}
Content-Type: application/json

{
  "callId": "{{call_id}}",
  "incidentId": "{{incident_id}}",
  "outcome": "acknowledged",
  "notes": "Civil Protection confirmed response."
}
```

Configure the ElevenLabs post-call webhook:

```text
POST {PUBLIC_TUNNEL_URL}/api/calls/elevenlabs/post-call?token={ELEVENLABS_WEBHOOK_TOKEN}
```

The post-call webhook stores transcript summary, transcript data when supplied, completion time, and failure reason when supplied.

## Twilio Verified Caller ID

Use this if you do not want to buy a Twilio number for the hackathon test.

1. Open Twilio Console.
2. Go to **Phone Numbers** -> **Manage** -> **Verified Caller IDs**.
3. Click **Add a new Caller ID**.
4. Enter the phone number you own in E.164 format, for example `+34612345678`.
5. Complete the SMS verification code.
6. Repeat for the recipient number if the account is still a Twilio trial account.
7. In ElevenLabs, import the verified caller ID under **Phone Numbers** -> **Twilio**.
8. ElevenLabs should detect it as **Outbound Only**.

For the final demo, a purchased Twilio voice number is cleaner. For testing, a verified caller ID is enough for outbound-only calls.
