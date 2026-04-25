# Upgrade Path

This file captures useful v2 ideas that should not block the MVP.

## AI Explanations

The MVP action recommender is deterministic. A later version can add an LLM-backed explanation provider.

Possible flow:

```text
risk engine output
-> action recommender
-> explanation provider
-> concise operator-facing recommendation
```

The dashboard should not depend on the LLM being available. If the AI call fails, show the deterministic recommendation.

## Predictive Environmental Model

The MVP can collect or simulate:

- temperature
- humidity
- light
- battery
- model latency

Future work can correlate these values with expected detection rates and generate predictions such as:

- elevated morning activity under cool/high-humidity conditions
- increased activity near urban trash zones
- changed risk score after repeated detections

For the hackathon, this can be presented as a designed extension if real data is unavailable.

## Map Editing

Deferred interactive map features:

- draw containment zones
- edit ROI boundaries
- drag station positions and persist them
- mark stations as good/bad manually
- configure zone alert rules in the UI

The MVP should use prebuilt stations and zones.

## Media Uploads

Deferred event media features are documented in [Device Image Snapshot Contract](device-image-snapshot-contract.md).

Planned approach:

- send metadata first
- upload one optional JPEG snapshot after receiving `eventId`
- store snapshots locally under `data/event-images/`
- expose snapshots through `/api/events/{eventId}/snapshot`

Additional future media features:

- attach short video clip
- blur people or private areas
- show model bounding boxes on snapshots

The MVP should send metadata only.

## Deployment

Deferred deployment options:

- Render/Fly/Railway hosted container
- domain with HTTPS
- basic auth for dashboard
- persistent hosted database
- device provisioning flow

The MVP can run locally through ngrok.
