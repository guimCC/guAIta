# Demo Story

## Main Pitch

guAIta is an Edge AI monitoring system for Collserola that detects wild boars locally, reports only meaningful events, and helps public teams respond faster and more efficiently.

The value is not only detection. The value is targeted response: knowing where to send people, when to escalate, and how to reduce unnecessary manual surveillance.

## Three-Minute Flow

1. Introduce the problem.
   - Collserola is hard to monitor manually.
   - Wild boar movement and disease containment can create safety, access, and public resource issues.
   - Edge AI enables low-cost distributed monitoring.

2. Show the architecture.
   - The Arduino UNO Q runs local vision inference.
   - The server receives compact detection events.
   - The dashboard turns events into alerts and recommendations.

3. Start the scenario.
   - A morning frontier-breach scenario begins.
   - The dashboard shows multiple fixed stations and risk zones.
   - The event graph starts to move.

4. Show a real edge event.
   - Put a boar image/video in front of the live camera.
   - The device detects the boar locally.
   - A live device event appears on the map.

5. Escalate operationally.
   - The system identifies risk near a high-transit or no-go frontier zone.
   - It raises alert severity.
   - It recommends an action, such as dispatching civil protection or a wildlife response team.

6. Close with scalability.
   - One device is a proof of concept.
   - The same architecture scales to many low-cost stations.
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
