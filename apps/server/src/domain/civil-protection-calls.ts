import { randomUUID } from "node:crypto";
import type { CivilProtectionCall, DetectionEvent, Station } from "@guaita/shared";
import { config } from "../config.js";

interface ElevenLabsOutboundCallResponse {
  success?: boolean;
  message?: string;
  conversation_id?: string | null;
  callSid?: string | null;
}

function compactId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function directionLabel(direction: DetectionEvent["direction"]): string {
  if (!direction) {
    return "unknown direction";
  }

  return direction.replaceAll("_", " ");
}

function stationCoordinates(station: Station): string {
  return `${station.latitude.toFixed(4)}, ${station.longitude.toFixed(4)}`;
}

function callbackUrl(path: string): string {
  const baseUrl = config.publicBaseUrl.replace(/\/$/, "");
  const tokenQuery = config.elevenLabsWebhookToken
    ? `?token=${encodeURIComponent(config.elevenLabsWebhookToken)}`
    : "";

  return `${baseUrl}${path}${tokenQuery}`;
}

function riskReason(event: DetectionEvent, station: Station): string {
  if (station.type === "frontier" || event.direction === "towards_city") {
    return "movement is crossing a high-transit forest boundary corridor near public access routes";
  }

  if (station.type === "urban") {
    return "movement is close to the urban edge where response teams need faster warning";
  }

  return "the detection confidence and recent movement pattern are above the normal monitoring baseline";
}

export function createCivilProtectionCallRecord(
  event: DetectionEvent,
  station: Station,
  toNumber: string,
  provider: CivilProtectionCall["provider"]
): CivilProtectionCall {
  const createdAt = new Date().toISOString();
  const reason = riskReason(event, station);

  return {
    id: compactId("call"),
    eventId: event.eventId,
    status: "requested",
    provider,
    toNumber,
    agentId: config.elevenLabsAgentId,
    agentPhoneNumberId: config.elevenLabsPhoneNumberId,
    incidentSummary: `${percent(event.confidence)} ${event.species.replace("_", " ")} detection at ${station.name}; ${reason}.`,
    createdAt,
    updatedAt: createdAt
  };
}

export function buildIncidentDynamicVariables(call: CivilProtectionCall, event: DetectionEvent, station: Station) {
  const source =
    event.source === "device"
      ? "Arduino UNO Q edge AI device"
      : event.source === "scenario"
        ? "scripted demo scenario"
        : "manual dashboard demo trigger";

  return {
    call_id: call.id,
    incident_id: event.eventId,
    inciden_id: event.eventId,
    event_id: event.eventId,
    station_id: station.id,
    station_name: station.name,
    severity: event.confidence >= 0.9 ? "critical" : event.confidence >= 0.85 ? "high" : "medium",
    species: event.species.replace("_", " "),
    confidence: percent(event.confidence),
    source,
    direction: directionLabel(event.direction),
    observed_at: event.observedAt,
    location_name: `${station.name}, Collserola`,
    coordinates: stationCoordinates(station),
    current_pattern:
      event.confidence >= 0.85
        ? "four detections in eleven minutes across nearby boundary stations in the demo scenario"
        : "one detection above the monitoring threshold",
    normal_pattern: "the usual demo baseline is zero to one detection per hour at this boundary corridor",
    risk_reason: riskReason(event, station),
    recommended_action:
      "send a civil protection or wildlife response patrol to the nearest access road and monitor the public trail crossing",
    acknowledge_callback_url: callbackUrl("/api/calls/civil-protection/acknowledge")
  };
}

export async function placeElevenLabsOutboundCall(
  call: CivilProtectionCall,
  event: DetectionEvent,
  station: Station
): Promise<Pick<CivilProtectionCall, "conversationId" | "callSid">> {
  if (!config.elevenLabsApiKey || !config.elevenLabsAgentId || !config.elevenLabsPhoneNumberId) {
    throw new Error("ElevenLabs calling is enabled, but ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, or ELEVENLABS_AGENT_PHONE_NUMBER_ID is missing.");
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": config.elevenLabsApiKey
    },
    body: JSON.stringify({
      agent_id: config.elevenLabsAgentId,
      agent_phone_number_id: config.elevenLabsPhoneNumberId,
      to_number: call.toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: buildIncidentDynamicVariables(call, event, station)
      }
    })
  });

  const text = await response.text();
  let body: ElevenLabsOutboundCallResponse | undefined;

  try {
    body = text ? (JSON.parse(text) as ElevenLabsOutboundCallResponse) : undefined;
  } catch {
    body = undefined;
  }

  if (!response.ok || body?.success === false) {
    throw new Error(body?.message ?? text ?? `ElevenLabs outbound call failed with ${response.status}`);
  }

  return {
    conversationId: body?.conversation_id ?? null,
    callSid: body?.callSid ?? null
  };
}
