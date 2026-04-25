# 0005 - Action Recommendation Engine

## Decision

Implement deterministic action recommendations in the MVP and keep LLM explanations as a v2 extension.

## Context

Recommendations add clear value to the project because they connect detections to public response. However, the demo should not depend on a live LLM call.

## MVP Examples

- Deploy civil protection near a busy access point before morning peak.
- Dispatch wildlife response to a containment frontier.
- Send cleaning crew to an urban/trash-adjacent zone with rising detection rates.
- Increase sampling for nearby stations after repeated detections.

## Implications

- Create a first-class `RecommendedAction` model.
- Keep rule-based recommendations working offline.
- Add an `explanation-provider` abstraction later if LLM output is added.
- The dashboard should show action title, evidence, assigned team, and status.
