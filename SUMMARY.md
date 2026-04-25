# Hackathon Project Summary

Meeting: Impromptu Google Meet, April 25  
Recording: https://fathom.video/share/_3jdYUzqd9USJbpmzm-miR8VMTxN2a6k

## Core Idea

Build an Edge AI proof of concept for detecting wild boars around Barcelona's Collserola area and turning those detections into operational alerts.

The project should use the provided Qualcomm/Arduino edge device with camera and sensors. The key requirement is that the important decision-making happens on the edge device, not only in a central server.

## Problem Context

- Barcelona and the Collserola area have had issues with a porcine disease outbreak affecting wild boars.
- Collserola closures and access controls create public cost, inconvenience, and safety concerns.
- Fencing or manually guarding a forest is expensive and hard to scale.
- Better real-time detection would help allocate public resources only where they are needed.
- Current sourced business-impact research lives in [docs/business-impact.md](docs/business-impact.md), with raw notes in [docs/research/ppa-business-impact-raw.md](docs/research/ppa-business-impact-raw.md).
- The key quantified hook is static patrol substitution: a Barcelona Guardia Urbana patrol car with two officers is listed at EUR 109.23/hour for special services, so one 24/7 entrance is about EUR 78.6k/month of patrol capacity.

## Value Proposition

Instead of trying to physically seal the forest, deploy many low-cost edge devices that detect wild boars and report only relevant events.

This enables:

- More efficient use of police, civil protection, and containment teams.
- Faster response when boars approach high-risk boundaries.
- Better monitoring of boar movement patterns.
- A scalable sensor network at a much lower cost than permanent manual surveillance.

## Proposed System

The system has three main layers:

1. Edge device
   - Camera-based wild boar detection.
   - Runs the vision model locally.
   - Sends an event only when a boar is detected.
   - Optional: estimate movement direction from camera frames.
   - Optional: use other sensors for device health or environmental context.

2. Central server
   - Receives detection events from many edge stations.
   - Stores timestamp, location, confidence, station ID, and direction if available.
   - Runs higher-level logic for alert severity, risk zones, and movement patterns.
   - Supports simulated events for the hackathon demo.

3. Dashboard
   - Real-time map of detections across Collserola.
   - Alert popups when a boar is detected.
   - Configurable risk zones and station types.
   - Operational view for deciding where to send resources.
   - Informational analytics for movement patterns, estimated activity, and trends.

## Demo Plan

The demo should tell a clear story:

1. Show the Collserola problem and why manual containment is costly.
2. Present a distributed network of low-cost edge stations.
3. Run one real device live during the demo.
4. Put a boar image/video in front of the camera.
5. The edge device detects the boar locally.
6. The server receives the detection.
7. The dashboard shows a map alert in real time.
8. Script additional simulated detections so the map feels like a complete deployed system.

The demo can be scripted as long as the real edge detection is shown clearly.

## Scope Decisions

- Main focus: detect wild boars with edge vision.
- Secondary focus: operational dashboard and alerting workflow.
- Avoid over-scoping into many species or broad biodiversity monitoring.
- Temperature, humidity, light, or accelerometer data are useful only if they support the main story.
- Good optional uses for non-camera sensors:
  - Device health monitoring.
  - Environmental context for later prediction.
  - Triggering vision only when motion or scene change is detected.

## Technical Ideas

- Run object detection or image classification on the edge device.
- Send metadata instead of streaming all video to save bandwidth and compute.
- Use simple frame-difference or motion detection to avoid running the full model constantly.
- Estimate boar direction by tracking movement across frames.
- Classify alerts by zone:
  - Low risk inside normal forest area.
  - Higher risk near park boundaries.
  - Maximum risk near urban exits, roads, or containment borders.
- Simulate many stations on the dashboard even if only one physical device is available.

## Team Split

Suggested split into two workstreams:

### Edge AI and Vision

- Set up the Arduino/Qualcomm device.
- Access the camera stream.
- Prepare or train a boar detection model.
- Run inference on-device.
- Emit detection events to the server.
- Explore direction estimation if time allows.

### Server, Dashboard, and Demo

- Build the central event ingestion API.
- Create the real-time map dashboard.
- Model stations, zones, severity, and alert states.
- Add simulated sensor events for a richer demo.
- Prepare the final story and presentation flow.

## Immediate Action Items

- Research Collserola boar outbreak data and maps.
- Find or create a small image/video dataset for wild boar detection.
- Confirm the exact edge hardware capabilities and supported model formats.
- Build the smallest possible end-to-end path:
  - Device detects boar.
  - Event reaches server.
  - Dashboard displays alert.
- Script simulated detections across multiple locations.
- Define 2-3 station types, such as control, frontier, and containment stations.
- Decide which extra sensors are useful enough to include.
- Prepare presentation numbers carefully and mark unverified estimates as assumptions.

## Main Pitch

guAIta is an Edge AI monitoring system for Collserola that detects wild boars locally, reports only meaningful events, and helps public teams respond faster and more efficiently.

The strongest message is not "we built a camera model"; it is "we help protect people, animals, public resources, and access to Collserola by making containment smarter and more targeted."
