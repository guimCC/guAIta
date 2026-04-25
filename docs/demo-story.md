# Demo Story

## Main Pitch

guAIta is an Edge AI monitoring system for Collserola that detects wild boars locally, reports only meaningful events, and helps public teams respond faster and more efficiently.

The value is not only detection. The value is targeted response: knowing where to send people, when to escalate, and how to reduce unnecessary manual surveillance.

## Business Impact Hook

The clearest impact claim is public-resource efficiency: guAIta moves the response model from static entrance coverage to event-triggered dispatch.

Use the sourced cost proxy in [business-impact.md](business-impact.md): Barcelona's 2025 Guardia Urbana tariff lists a patrol car with two officers at EUR 109.23/hour. One forest entrance covered 24/7 for a 30-day month is therefore about EUR 78.6k of patrol capacity. At 20 entrances, static coverage reaches about EUR 1.57M/month.

Demo-safe close:

> We are not claiming to stop wild boars. We are helping public teams spend less time waiting at every entrance and more time acting where detections show real risk.

## Three-Minute Flow

1. Introduce the problem.
   - Collserola is hard to monitor manually.
   - Wild boar movement and disease containment can create safety, access, and public resource issues.
   - Static entrance surveillance is expensive; Edge AI enables lower-cost distributed monitoring and targeted dispatch.

2. Show the architecture.
   - The Arduino UNO Q runs local vision inference.
   - The server receives compact detection events.
   - The dashboard turns events into alerts and recommendations.

3. Start the scenario.
   - A morning frontier-breach scenario begins.
   - The dashboard shows multiple fixed stations and risk zones.
   - The event graph starts to move.

4. Show a real edge event.
   - Arm **Listen from device** in the dashboard when the presenter is ready for the live device moment.
   - Put a boar image/video in front of the live camera.
   - The device detects the boar locally.
   - A live device event appears on the map, the backend auto-disarms device listening, pauses the scenario clock, and starts the Civil Protection escalation flow.
   - Additional device detections are ignored while that live escalation is still being handled, keeping the demo focused on one incident.

5. Escalate operationally.
   - The system identifies risk near a high-transit or no-go frontier zone.
   - It raises alert severity.
   - It recommends an action, such as dispatching civil protection or a wildlife response team.
   - The ElevenLabs agent calls the demo recipient, explains why the pattern is unusual, answers location and baseline questions, and marks the alert acknowledged when the recipient confirms a response.
   - If needed, the dashboard **Call Civil Protection** control can retry a failed call, but it does not create duplicate calls while one is already active.

6. Close with scalability.
   - One device is a proof of concept.
   - The same architecture scales to many low-cost stations.
   - The measurable value is avoided static patrol hours and faster response to the entrances that actually show activity.
   - Future versions can use environmental telemetry and AI explanations.

## MVP Story Candidate

`morning-frontier-breach`

Boar movement increases near a Collserola boundary early in the morning, close to a high-transit access point. The system detects movement, highlights the affected zone, and recommends sending a civil protection vehicle before pedestrian traffic peaks.

## Dashboard Story Elements

- Map centered on Collserola.
- Fixed stations with health/status.
- Fixed risk/containment zones.
- Event graph showing rising activity.
- Active alert panel.
- Recommended action panel with evidence.
- Civil Protection call status and acknowledgement.
- Scenario detections remain visible in the timeline, but only live device events and the manual Edge AI simulation create the primary call-worthy alert.
- Scenario controls: start, pause, advance, reset.
- Live device event label when Arduino sends real data.

## Copy Tone

Use professional operational language.

Prefer:

- wildlife response
- containment protocol
- civil protection dispatch
- cleaning crew inspection
- high-risk access point

Avoid casual or violent UI copy.
