import {
  Activity,
  Battery,
  BellRing,
  ChevronDown,
  CheckCircle2,
  Clock3,
  Droplets,
  FastForward,
  MapPin,
  Pause,
  PhoneCall,
  Play,
  RadioTower,
  RotateCcw,
  ShieldAlert,
  Signal,
  Sun,
  Thermometer,
  Trash2,
  Wifi,
  WifiOff
} from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type CivilProtectionCall,
  type DetectionEvent,
  type ScenarioState,
  type Station,
  type TelemetryReading,
  type Zone
} from "@guaita/shared";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { apiBaseUrl, getMapStyleUrl, mapInitialView, socketUrl } from "./mapConfig";
import { PublicStatusPage } from "./PublicStatusPage";

type ConnectionState = "connecting" | "connected" | "offline";
type CallStageState = "done" | "current" | "pending" | "failed";

interface CallStage {
  id: string;
  label: string;
  state: CallStageState;
  timeLabel: string;
  detail: string;
}

const DEMO_DETECTION_STATION_ID = "collserola-control-02";
const DETECTION_FLASH_TTL_MS = 6_500;
const DETECTION_FLASH_INTERVAL_MS = 80;

interface StationsResponse {
  stations: Station[];
}

interface ZonesResponse {
  zones: Zone[];
}

interface EventsResponse {
  events: DetectionEvent[];
}

interface TelemetryResponse {
  telemetry: TelemetryReading[];
}

interface DeviceListeningState {
  enabled: boolean;
  updatedAt: string;
  reason: string;
  expiresAt?: string;
}

interface DeviceListeningResponse {
  ok?: boolean;
  deviceListening: DeviceListeningState;
  error?: string;
  message?: string;
}

interface CallsResponse {
  calls: CivilProtectionCall[];
}

interface CivilProtectionCallResponse {
  ok: boolean;
  call?: CivilProtectionCall;
  error?: string;
  message?: string;
}

interface ScenarioResponse {
  scenario: ScenarioState;
}

interface CreateEventResponse {
  ok: boolean;
  event?: DetectionEvent;
  eventId?: string;
  call?: CivilProtectionCall;
  error?: string;
}

interface ClearEventsResponse {
  ok: boolean;
  deletedCount: number;
  error?: string;
}

interface ClearAlertsResponse {
  ok: boolean;
  deletedCount: number;
  error?: string;
}

interface ScenarioCommandResponse {
  ok: boolean;
  scenario?: ScenarioState;
  error?: string;
  message?: string;
}

interface AlertTrackingItem {
  id: string;
  title: string;
  target: string;
  status: string;
  detail: string;
  tone: "standby" | "queued" | "active";
}

interface DetectionFlash {
  event: DetectionEvent;
  receivedAtMs: number;
}

const emptyPointCollection: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: []
};

const emptyPolygonCollection: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: []
};

const scenarioSpeedOptions = [1, 120, 480, 1440] as const;

function apiUrl(path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function upsertEvent(events: DetectionEvent[], event: DetectionEvent): DetectionEvent[] {
  return [event, ...events.filter((existing) => existing.eventId !== event.eventId)].slice(0, 100);
}

function upsertCall(calls: CivilProtectionCall[], call: CivilProtectionCall): CivilProtectionCall[] {
  return [call, ...calls.filter((existing) => existing.id !== call.id)].slice(0, 50);
}

function latestCallsByEvent(calls: CivilProtectionCall[]): CivilProtectionCall[] {
  const eventIds = new Set<string>();
  const latestCalls: CivilProtectionCall[] = [];

  for (const call of calls) {
    if (eventIds.has(call.eventId)) {
      continue;
    }

    eventIds.add(call.eventId);
    latestCalls.push(call);
  }

  return latestCalls;
}

function upsertTelemetry(readings: TelemetryReading[], reading: TelemetryReading): TelemetryReading[] {
  return [reading, ...readings.filter((existing) => existing.telemetryId !== reading.telemetryId)].slice(0, 200);
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatTemperature(value: number | undefined): string {
  return value === undefined ? "n/a" : `${value.toFixed(1)} C`;
}

function formatHumidity(value: number | undefined): string {
  return value === undefined ? "n/a" : `${Math.round(value)}%`;
}

function formatLight(value: number | undefined): string {
  return value === undefined ? "n/a" : `${Math.round(value)} lux`;
}

function formatBattery(value: number | undefined): string {
  return value === undefined ? "n/a" : `${Math.round(value)}%`;
}

function formatSignal(value: number | undefined): string {
  return value === undefined ? "n/a" : `${Math.round(value)} dBm`;
}

function stationLabel(stationId: string, stationById: Map<string, Station>): string {
  return stationById.get(stationId)?.name ?? stationId;
}

function callStatusLabel(call: CivilProtectionCall | undefined): string {
  if (!call) {
    return "ready to call";
  }

  switch (call.status) {
    case "requested":
      return call.provider === "demo" ? "demo record stored" : "request queued";
    case "calling":
      return "call in progress";
    case "acknowledged":
      return "response handled";
    case "completed":
      return "needs confirmation";
    case "failed":
      return "call failed";
  }

  return "call status unknown";
}

function callStatusDetail(call: CivilProtectionCall): string {
  if (call.error) {
    return call.error;
  }

  if (call.acknowledgement) {
    return call.acknowledgement;
  }

  if (call.transcriptSummary) {
    return call.transcriptSummary;
  }

  switch (call.status) {
    case "requested":
      return call.provider === "demo"
        ? "The escalation was stored in demo mode. Enable real calls to dial the configured recipient."
        : "Waiting for ElevenLabs and Twilio to accept the outbound call request.";
    case "calling":
      return "Provider accepted the request. Waiting for the phone conversation to finish and report back.";
    case "completed":
      return "Call ended. Confirm the response once Civil Protection acknowledged the alert.";
    case "acknowledged":
      return "Civil Protection acknowledged the alert.";
    case "failed":
      return "The outbound call did not complete. Retry or mark handled manually if the team confirmed outside the call.";
  }

  return "Call status is being updated.";
}

function shortIdentifier(value: string | null | undefined): string {
  if (!value) {
    return "pending";
  }

  return value.length <= 14 ? value : `${value.slice(0, 10)}...${value.slice(-4)}`;
}

function redactedPhone(value: string | undefined): string {
  if (!value) {
    return "configured recipient";
  }

  return value.length <= 7 ? value : `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function timestampLabel(value: string | undefined): string {
  return value ? formatTime(value) : "pending";
}

function hasProviderAccepted(call: CivilProtectionCall): boolean {
  return Boolean(call.providerAcceptedAt || call.conversationId || call.callSid) ||
    ["calling", "completed", "acknowledged"].includes(call.status);
}

function hasCallClosed(call: CivilProtectionCall): boolean {
  return Boolean(call.completedAt) || ["completed", "acknowledged"].includes(call.status);
}

function callLifecycleStages(call: CivilProtectionCall): CallStage[] {
  const providerAccepted = hasProviderAccepted(call);
  const callClosed = hasCallClosed(call);
  const failedBeforeProvider = call.status === "failed" && !providerAccepted;
  const failedAfterProvider = call.status === "failed" && providerAccepted;
  const providerDetail = providerAccepted
    ? `Provider accepted${call.providerAcceptedAt ? "" : " before timestamp capture"}.`
    : call.provider === "demo"
      ? "Demo mode stored the escalation without dialing."
      : "Waiting for ElevenLabs/Twilio acceptance.";
  const conversationDetail = call.conversationId || call.callSid
    ? `Conversation ${shortIdentifier(call.conversationId)} / SID ${shortIdentifier(call.callSid)}.`
    : providerAccepted
      ? "Phone leg active or awaiting post-call webhook."
      : "No phone conversation has started yet.";

  return [
    {
      id: "event",
      label: "Incident locked",
      state: "done",
      timeLabel: timestampLabel(call.createdAt),
      detail: `Event ${shortIdentifier(call.eventId)} is linked to this escalation.`
    },
    {
      id: "provider",
      label: "Provider accepted",
      state: failedBeforeProvider ? "failed" : providerAccepted ? "done" : "current",
      timeLabel: timestampLabel(call.providerAcceptedAt),
      detail: providerDetail
    },
    {
      id: "conversation",
      label: "Conversation closed",
      state: call.status === "failed" ? "failed" : callClosed ? "done" : providerAccepted ? "current" : "pending",
      timeLabel: timestampLabel(call.completedAt ?? call.failedAt),
      detail: failedAfterProvider ? call.error ?? "Call failed after provider acceptance." : conversationDetail
    },
    {
      id: "handled",
      label: "Response handled",
      state: call.status === "acknowledged" ? "done" : call.status === "failed" ? "pending" : callClosed ? "current" : "pending",
      timeLabel: timestampLabel(call.acknowledgedAt),
      detail: call.acknowledgement ?? "Waiting for operator or ElevenLabs tool acknowledgement."
    }
  ];
}

function callNextAction(call: CivilProtectionCall): { title: string; detail: string } {
  if (call.status === "failed") {
    return {
      title: "Retry available",
      detail: call.error ?? "Check the provider setup, then retry the call from the dashboard."
    };
  }

  if (call.status === "acknowledged") {
    return {
      title: "Ready to clear",
      detail: "The response is confirmed. You can clear alert tracking for the next demo incident."
    };
  }

  if (call.status === "completed") {
    return {
      title: "Confirm response",
      detail: "The phone call ended. Mark handled once the recipient confirms they will check the area."
    };
  }

  if (call.status === "calling") {
    return {
      title: "Waiting on call result",
      detail: "Keep the call open until ElevenLabs posts completion or the tool acknowledges the alert."
    };
  }

  return {
    title: call.provider === "demo" ? "Demo mode" : "Waiting on provider",
    detail: call.provider === "demo"
      ? "No phone call was placed because real outbound calls are disabled."
      : "ElevenLabs has not returned a conversation identifier yet."
  };
}

function callTone(call: CivilProtectionCall | undefined, isHighConfidence: boolean): AlertTrackingItem["tone"] {
  if (call?.status === "acknowledged") {
    return "standby";
  }

  if (call?.status === "calling" || call?.status === "completed") {
    return "active";
  }

  return isHighConfidence ? "active" : "queued";
}

function latestCallForEvent(calls: CivilProtectionCall[], eventId: string | undefined): CivilProtectionCall | undefined {
  return eventId ? calls.find((call) => call.eventId === eventId) : undefined;
}

function unresolvedEscalationCallEvent(
  calls: CivilProtectionCall[],
  events: DetectionEvent[]
): DetectionEvent | undefined {
  for (const call of calls) {
    if (!isUnresolvedCall(call)) {
      continue;
    }

    const event = events.find((candidate) => candidate.eventId === call.eventId);
    if (event && isEscalationEvent(event)) {
      return event;
    }
  }

  return undefined;
}

function controlStationNumber(station: Pick<Station, "id" | "name">): number | undefined {
  const nameMatch = station.name.match(/Control Station\s+(\d+)/i);
  if (nameMatch?.[1]) {
    return Number(nameMatch[1]);
  }

  const idMatch = station.id.match(/collserola-control-(\d+)/i);
  return idMatch?.[1] ? Number(idMatch[1]) : undefined;
}

function isRiskControlStation(station: Pick<Station, "id" | "name">): boolean {
  const stationNumber = controlStationNumber(station);
  return stationNumber !== undefined && stationNumber >= 1 && stationNumber <= 12;
}

function isDeviceStation(station: Pick<Station, "id" | "name">): boolean {
  return station.id === DEMO_DETECTION_STATION_ID || station.name === "Control Station 02";
}

function isEscalationEvent(event: DetectionEvent): boolean {
  return event.source === "device" || event.source === "manual";
}

function isUnresolvedCall(call: CivilProtectionCall): boolean {
  return call.status !== "acknowledged";
}

function canStartCivilProtectionCall(call: CivilProtectionCall | undefined): boolean {
  return !call || call.status === "failed";
}

function civilProtectionButtonLabel(
  call: CivilProtectionCall | undefined,
  isCalling: boolean,
  hasActiveAlert: boolean
): string {
  if (isCalling) {
    return "Calling";
  }

  if (!hasActiveAlert) {
    return "No active alert";
  }

  if (!call) {
    return "Call Civil Protection";
  }

  if (call.status === "failed") {
    return "Retry Civil Protection";
  }

  if (call.status === "acknowledged") {
    return "Acknowledged";
  }

  if (call.status === "completed") {
    return "Awaiting handled";
  }

  return "Call in progress";
}

function formatScenarioClock(scenarioState: ScenarioState | null): string {
  const value = scenarioState?.virtualNowIso ?? "2026-04-25T02:30:00.000Z";

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatScenarioBoundary(value: string | undefined, fallback: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value ?? fallback));
}

function scenarioProgress(scenarioState: ScenarioState | null): number {
  if (!scenarioState) {
    return 0;
  }

  return Math.min(100, Math.max(0, (scenarioState.currentTimeMs / scenarioState.durationMs) * 100));
}

function shouldRenderPublicStatusPage(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (new URLSearchParams(window.location.search).get("view") === "public") {
    return true;
  }

  return ["guaita.biz", "www.guaita.biz"].includes(window.location.hostname);
}

function buildAlertTrackingItems(
  latestEvent: DetectionEvent | undefined,
  stationById: Map<string, Station>,
  latestCall: CivilProtectionCall | undefined
): AlertTrackingItem[] {
  if (!latestEvent || !isEscalationEvent(latestEvent)) {
    return [];
  }

  const stationName = stationLabel(latestEvent.stationId, stationById);
  const status = latestCall ? callStatusLabel(latestCall) : "ready to call";

  return [
    {
      id: `${latestEvent.eventId}-civil-protection`,
      title: "Civil Protection",
      target: latestEvent.source === "device" ? "Live device escalation" : "Manual Edge AI simulation",
      status,
      detail: latestCall?.acknowledgement ?? `${stationName}, ${percent(latestEvent.confidence)} confidence`,
      tone: callTone(latestCall, true)
    }
  ];
}

function buildStationFeatures(stations: Station[]): FeatureCollection<Point> {
  const features: Feature<Point>[] = stations.map((station) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [station.longitude, station.latitude]
    },
    properties: {
      id: station.id,
      name: station.name,
      type: station.type,
      status: station.status,
      device: isDeviceStation(station),
      risk: isRiskControlStation(station),
      batteryPct: station.batteryPct ?? null
    }
  }));

  return {
    type: "FeatureCollection",
    features
  };
}

function buildZoneFeatures(zones: Zone[]): FeatureCollection<Polygon> {
  const features: Feature<Polygon>[] = zones.map((zone) => ({
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [zone.polygon]
    },
    properties: {
      id: zone.id,
      name: zone.name,
      kind: zone.kind,
      severity: zone.severity
    }
  }));

  return {
    type: "FeatureCollection",
    features
  };
}

function buildEventFeatures(
  flashes: DetectionFlash[],
  stationById: Map<string, Station>,
  nowMs: number
): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];

  for (const flash of flashes) {
    const event = flash.event;
    const station = stationById.get(event.stationId);
    const ageMs = nowMs - flash.receivedAtMs;

    if (!station || ageMs < 0 || ageMs > DETECTION_FLASH_TTL_MS) {
      continue;
    }

    const progress = Math.min(1, ageMs / DETECTION_FLASH_TTL_MS);
    const decay = Math.max(0, 1 - progress);
    const sourceWeight = event.source === "scenario" ? 0.72 : 1;
    const confidenceWeight = 0.75 + event.confidence * 0.25;

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [station.longitude, station.latitude]
      },
      properties: {
        eventId: event.eventId,
        stationId: event.stationId,
        source: event.source,
        confidence: event.confidence,
        observedAt: event.observedAt,
        ringRadius: 11 + progress * 38 * confidenceWeight,
        ringOpacity: 0.4 * sourceWeight * Math.pow(decay, 1.45),
        strokeOpacity: 0.55 * sourceWeight * Math.pow(decay, 1.1),
        coreRadius: 7 - progress * 2,
        coreOpacity: 0.95 * sourceWeight * Math.pow(decay, 0.82)
      }
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}

function setSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection): void {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function MapPanel({
  stations,
  zones,
  events
}: {
  stations: Station[];
  zones: Zone[];
  events: DetectionEvent[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const flashesRef = useRef<Map<string, DetectionFlash>>(new Map());
  const hydratedEventsRef = useRef(false);
  const seenEventIdsRef = useRef<Set<string>>(new Set());

  const stationById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const stationFeatures = useMemo(() => buildStationFeatures(stations), [stations]);
  const zoneFeatures = useMemo(() => buildZoneFeatures(zones), [zones]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: mapInitialView.center,
      zoom: mapInitialView.zoom,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
      map.addSource("zones", {
        type: "geojson",
        data: emptyPolygonCollection
      });
      map.addLayer({
        id: "zone-fill",
        type: "fill",
        source: "zones",
        paint: {
          "fill-color": [
            "match",
            ["get", "severity"],
            "critical",
            "#dc2626",
            "high",
            "#f59e0b",
            "medium",
            "#d97706",
            "low",
            "#166534",
            "#52525b"
          ],
          "fill-opacity": 0.22
        }
      });
      map.addLayer({
        id: "zone-outline",
        type: "line",
        source: "zones",
        paint: {
          "line-color": "#a3a3a3",
          "line-width": 1.2,
          "line-opacity": 0.75
        }
      });
      map.addSource("stations", {
        type: "geojson",
        data: emptyPointCollection
      });
      map.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-color": [
            "case",
            ["==", ["get", "device"], true],
            "#facc15",
            ["==", ["get", "risk"], true],
            "#ef4444",
            [
              "match",
              ["get", "type"],
              "frontier",
              "#f59e0b",
              "containment",
              "#84cc16",
              "urban",
              "#ef4444",
              "#22c55e"
            ]
          ],
          "circle-radius": [
            "case",
            ["==", ["get", "device"], true],
            10,
            [
              "match",
              ["get", "status"],
              "degraded",
              7,
              "offline",
              6,
              8
            ]
          ],
          "circle-stroke-color": [
            "case",
            ["==", ["get", "device"], true],
            "#713f12",
            "#1c1917"
          ],
          "circle-stroke-width": [
            "case",
            ["==", ["get", "device"], true],
            3,
            2
          ]
        }
      });
      map.addLayer({
        id: "station-labels",
        type: "symbol",
        source: "stations",
        layout: {
          "text-field": ["get", "name"],
          "text-offset": [0, 1.25],
          "text-size": 11,
          "text-anchor": "top"
        },
        paint: {
          "text-color": "#f5f5f4",
          "text-halo-color": "#1c1917",
          "text-halo-width": 1.1
        }
      });
      map.addSource("events", {
        type: "geojson",
        data: emptyPointCollection
      });
      map.addLayer({
        id: "event-pulses",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": [
            "match",
            ["get", "source"],
            "device",
            "#ef4444",
            "manual",
            "#f59e0b",
            "#22c55e"
          ],
          "circle-radius": ["get", "ringRadius"],
          "circle-opacity": ["get", "ringOpacity"],
          "circle-blur": 0.45,
          "circle-stroke-color": [
            "match",
            ["get", "source"],
            "device",
            "#7f1d1d",
            "manual",
            "#92400e",
            "#14532d"
          ],
          "circle-stroke-opacity": ["get", "strokeOpacity"],
          "circle-stroke-width": 1.2
        }
      });
      map.addLayer({
        id: "event-dots",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": [
            "match",
            ["get", "source"],
            "device",
            "#fecaca",
            "manual",
            "#fef3c7",
            "#bbf7d0"
          ],
          "circle-radius": ["get", "coreRadius"],
          "circle-opacity": ["get", "coreOpacity"],
          "circle-stroke-color": "#1c1917",
          "circle-stroke-opacity": ["get", "coreOpacity"],
          "circle-stroke-width": 2
        }
      });
      setMapReady(true);
    });

    map.on("error", (event) => {
      setMapError(event.error?.message ?? "Map style unavailable");
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    setSourceData(map, "zones", zoneFeatures);
    setSourceData(map, "stations", stationFeatures);
  }, [mapReady, stationFeatures, zoneFeatures]);

  useEffect(() => {
    if (!hydratedEventsRef.current) {
      for (const event of events) {
        seenEventIdsRef.current.add(event.eventId);
      }
      hydratedEventsRef.current = true;
      return;
    }

    const nowMs = performance.now();
    for (const event of events.slice(0, 20)) {
      if (seenEventIdsRef.current.has(event.eventId)) {
        continue;
      }

      seenEventIdsRef.current.add(event.eventId);
      flashesRef.current.set(event.eventId, {
        event,
        receivedAtMs: nowMs
      });
    }
  }, [events]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) {
      return;
    }

    const renderFlashes = () => {
      const nowMs = performance.now();
      for (const [eventId, flash] of flashesRef.current) {
        if (nowMs - flash.receivedAtMs > DETECTION_FLASH_TTL_MS) {
          flashesRef.current.delete(eventId);
        }
      }

      setSourceData(map, "events", buildEventFeatures([...flashesRef.current.values()], stationById, nowMs));
    };

    renderFlashes();
    const interval = window.setInterval(renderFlashes, DETECTION_FLASH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [mapReady, stationById]);

  return (
    <section className="map-panel" aria-label="Collserola operational map">
      <div ref={containerRef} className="map-container" />
      <div className="map-hud">
        <span className="hud-title">Collserola</span>
        <span>{stations.length} stations</span>
        <span>{events.length} detections</span>
      </div>
      {mapError ? <div className="map-error">{mapError}</div> : null}
    </section>
  );
}

export function App() {
  if (shouldRenderPublicStatusPage()) {
    return <PublicStatusPage />;
  }

  const [stations, setStations] = useState<Station[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [telemetryReadings, setTelemetryReadings] = useState<TelemetryReading[]>([]);
  const [calls, setCalls] = useState<CivilProtectionCall[]>([]);
  const [scenarioState, setScenarioState] = useState<ScenarioState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [isCallingCivilProtection, setIsCallingCivilProtection] = useState(false);
  const [isMarkingCallHandled, setIsMarkingCallHandled] = useState(false);
  const [isClearingEvents, setIsClearingEvents] = useState(false);
  const [isClearingAlerts, setIsClearingAlerts] = useState(false);
  const [isScenarioBusy, setIsScenarioBusy] = useState(false);
  const [isSettingDeviceListening, setIsSettingDeviceListening] = useState(false);
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [dismissedAlertEventIds, setDismissedAlertEventIds] = useState<Set<string>>(() => new Set());
  const stationListRef = useRef<HTMLDivElement | null>(null);
  const [listenFromDevice, setListenFromDevice] = useState(false);
  const listenFromDeviceRef = useRef(false);
  const ignoredDeviceEventIdsRef = useRef<Set<string>>(new Set());

  const stationById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const latestTelemetryByStation = useMemo(() => {
    const latest = new Map<string, TelemetryReading>();

    for (const reading of telemetryReadings) {
      const existing = latest.get(reading.stationId);
      if (!existing || new Date(reading.observedAt).getTime() > new Date(existing.observedAt).getTime()) {
        latest.set(reading.stationId, reading);
      }
    }

    return latest;
  }, [telemetryReadings]);
  const latestEvent = events[0];
  const currentCalls = useMemo(() => latestCallsByEvent(calls), [calls]);
  const activeCallEvent = useMemo(
    () => unresolvedEscalationCallEvent(currentCalls, events),
    [currentCalls, events]
  );
  const latestEscalationEvent = useMemo(
    () => events.find((event) => isEscalationEvent(event) && !dismissedAlertEventIds.has(event.eventId)),
    [dismissedAlertEventIds, events]
  );
  const activeAlertEvent = activeCallEvent ?? latestEscalationEvent;
  const latestCall = latestCallForEvent(currentCalls, activeAlertEvent?.eventId);
  const activeStationCount = stations.filter((station) => station.status === "online").length;
  const telemetryStationCount = latestTelemetryByStation.size;
  const sortedStations = useMemo(() => {
    return [...stations].sort((a, b) => {
      const aRank = isDeviceStation(a) ? 0 : latestTelemetryByStation.has(a.id) ? 1 : 2;
      const bRank = isDeviceStation(b) ? 0 : latestTelemetryByStation.has(b.id) ? 1 : 2;

      if (aRank !== bRank) {
        return aRank - bRank;
      }

      if (aRank === 1) {
        const aObservedAt = latestTelemetryByStation.get(a.id)?.observedAt ?? "";
        const bObservedAt = latestTelemetryByStation.get(b.id)?.observedAt ?? "";
        return new Date(bObservedAt).getTime() - new Date(aObservedAt).getTime();
      }

      return a.name.localeCompare(b.name);
    });
  }, [latestTelemetryByStation, stations]);
  const alertTrackingItems = useMemo(
    () => buildAlertTrackingItems(activeAlertEvent, stationById, latestCall),
    [activeAlertEvent, latestCall, stationById]
  );
  const canCallCivilProtection = Boolean(activeAlertEvent) && canStartCivilProtectionCall(latestCall);
  const civilProtectionCallLabel = civilProtectionButtonLabel(
    latestCall,
    isCallingCivilProtection,
    Boolean(activeAlertEvent)
  );

  function applyDeviceListeningState(nextValue: boolean, options?: { clearIgnoredEvents?: boolean }) {
    listenFromDeviceRef.current = nextValue;
    setListenFromDevice(nextValue);

    if (options?.clearIgnoredEvents) {
      ignoredDeviceEventIdsRef.current.clear();
    }
  }

  async function setDeviceListening(nextValue: boolean, options?: { clearIgnoredEvents?: boolean }) {
    const previousValue = listenFromDeviceRef.current;
    applyDeviceListeningState(nextValue, options);
    setIsSettingDeviceListening(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/device/listening"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          enabled: nextValue
        })
      });
      const body = (await response.json()) as DeviceListeningResponse;

      if (!response.ok || body.ok === false) {
        throw new Error(body.message ?? body.error ?? `${response.status} ${response.statusText}`);
      }

      applyDeviceListeningState(body.deviceListening.enabled, options);
    } catch (listenError) {
      applyDeviceListeningState(previousValue);
      setError(listenError instanceof Error ? listenError.message : "Could not update device listener.");
    } finally {
      setIsSettingDeviceListening(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [
          stationResponse,
          zoneResponse,
          eventResponse,
          telemetryResponse,
          deviceListeningResponse,
          callResponse,
          scenarioResponse
        ] = await Promise.all([
          fetchJson<StationsResponse>("/api/stations"),
          fetchJson<ZonesResponse>("/api/zones"),
          fetchJson<EventsResponse>("/api/events?limit=50"),
          fetchJson<TelemetryResponse>("/api/telemetry/latest"),
          fetchJson<DeviceListeningResponse>("/api/device/listening"),
          fetchJson<CallsResponse>("/api/calls?limit=20"),
          fetchJson<ScenarioResponse>("/api/scenario/state")
        ]);

        if (!isMounted) {
          return;
        }

        setStations(stationResponse.stations);
        setZones(zoneResponse.zones);
        setEvents(eventResponse.events);
        setTelemetryReadings(telemetryResponse.telemetry);
        applyDeviceListeningState(deviceListeningResponse.deviceListening.enabled);
        setCalls(callResponse.calls);
        setScenarioState(scenarioResponse.scenario);
        setError(null);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load dashboard data.");
        }
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const socket: Socket = io(socketUrl, {
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      setConnectionState("connected");
    });
    socket.on("disconnect", () => {
      setConnectionState("offline");
    });
    socket.on("connect_error", () => {
      setConnectionState("offline");
    });
    socket.on(SOCKET_EVENTS.detectionCreated, (event: DetectionEvent) => {
      if (event.source === "device") {
        if (!listenFromDeviceRef.current) {
          ignoredDeviceEventIdsRef.current.add(event.eventId);
          return;
        }

        applyDeviceListeningState(false);
      }

      setEvents((currentEvents) => upsertEvent(currentEvents, event));
      setDismissedAlertEventIds((currentIds) => {
        if (!currentIds.has(event.eventId)) {
          return currentIds;
        }

        const nextIds = new Set(currentIds);
        nextIds.delete(event.eventId);
        return nextIds;
      });
    });
    socket.on(SOCKET_EVENTS.telemetryCreated, (reading: TelemetryReading) => {
      if (reading.source === "device" && !listenFromDeviceRef.current) {
        return;
      }

      setTelemetryReadings((currentReadings) => upsertTelemetry(currentReadings, reading));
    });
    socket.on(SOCKET_EVENTS.telemetryCleared, () => {
      setTelemetryReadings([]);
    });
    socket.on(SOCKET_EVENTS.deviceListenerUpdated, (state: DeviceListeningState) => {
      applyDeviceListeningState(state.enabled, { clearIgnoredEvents: state.enabled });
    });
    socket.on(SOCKET_EVENTS.eventsCleared, () => {
      setEvents([]);
      setDismissedAlertEventIds(new Set());
    });
    socket.on(SOCKET_EVENTS.callUpdated, (call: CivilProtectionCall) => {
      if (ignoredDeviceEventIdsRef.current.has(call.eventId)) {
        return;
      }

      setCalls((currentCalls) => upsertCall(currentCalls, call));
    });
    socket.on(SOCKET_EVENTS.callsCleared, () => {
      setCalls([]);
    });
    socket.on(SOCKET_EVENTS.scenarioUpdated, (state: ScenarioState) => {
      setScenarioState(state);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      try {
        const callResponse = await fetchJson<CallsResponse>("/api/calls?limit=20");
        setCalls(callResponse.calls);
      } catch {
        // Socket.IO remains the primary path; polling is a quiet fallback for call status.
      }
    }, 3_000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!expandedStationId || !stationListRef.current) {
      return;
    }

    const stationCard = Array.from(stationListRef.current.querySelectorAll<HTMLElement>("[data-station-id]"))
      .find((element) => element.dataset.stationId === expandedStationId);

    stationCard?.scrollIntoView({
      block: "start",
      behavior: "smooth"
    });
  }, [expandedStationId]);

  async function simulateDetection() {
    const targetStation =
      stations.find((station) => station.id === DEMO_DETECTION_STATION_ID) ??
      stations.find((station) => station.name === "Control Station 02") ??
      stations.find((station) => station.type === "frontier") ??
      stations[0];

    if (!targetStation) {
      setError("No station is available for simulation.");
      return;
    }

    setIsPosting(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/manual/events"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          stationId: targetStation.id,
          observedAt: new Date().toISOString(),
          source: "manual",
          species: "wild_boar",
          confidence: 0.89,
          count: 1,
          direction: "towards_city",
          temperatureC: 16.8,
          humidityPct: 72,
          lightLux: 310,
          batteryPct: targetStation.batteryPct
        })
      });
      const body = (await response.json()) as CreateEventResponse;

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }

      const createdEvent = body.event;
      if (connectionState !== "connected" && createdEvent) {
        setEvents((currentEvents) => upsertEvent(currentEvents, createdEvent));
      }
      if (body.call) {
        setCalls((currentCalls) => upsertCall(currentCalls, body.call as CivilProtectionCall));
      }
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Simulation failed.");
    } finally {
      setIsPosting(false);
    }
  }

  async function callCivilProtection() {
    if (!activeAlertEvent) {
      setError("No active detection to escalate.");
      return;
    }

    if (!canStartCivilProtectionCall(latestCall)) {
      setError("Civil Protection is already being tracked for this alert.");
      return;
    }

    setIsCallingCivilProtection(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/calls/civil-protection"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          eventId: activeAlertEvent.eventId
        })
      });
      const body = (await response.json()) as CivilProtectionCallResponse;

      if (!response.ok || !body.ok || !body.call) {
        throw new Error(body.message ?? body.error ?? `${response.status} ${response.statusText}`);
      }

      setCalls((currentCalls) => upsertCall(currentCalls, body.call as CivilProtectionCall));
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "Civil Protection call failed.");
    } finally {
      setIsCallingCivilProtection(false);
    }
  }

  async function markCallHandled() {
    if (!latestCall) {
      setError("No Civil Protection call to mark as handled.");
      return;
    }

    setIsMarkingCallHandled(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/calls/civil-protection/dashboard-acknowledge"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          callId: latestCall.id,
          notes: "Dashboard operator confirmed Civil Protection response."
        })
      });
      const body = (await response.json()) as CivilProtectionCallResponse;

      if (!response.ok || !body.ok || !body.call) {
        throw new Error(body.message ?? body.error ?? `${response.status} ${response.statusText}`);
      }

      setCalls((currentCalls) => upsertCall(currentCalls, body.call as CivilProtectionCall));
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "Could not mark call as handled.");
    } finally {
      setIsMarkingCallHandled(false);
    }
  }

  async function runScenarioCommand(path: string, body?: Record<string, unknown>) {
    setIsScenarioBusy(true);
    setError(null);

    try {
      const request: RequestInit = body
        ? {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
          }
        : {
            method: "POST"
          };
      const response = await fetch(apiUrl(path), request);
      const responseBody = (await response.json()) as ScenarioCommandResponse;

      if (!response.ok || !responseBody.ok || !responseBody.scenario) {
        throw new Error(responseBody.message ?? responseBody.error ?? `${response.status} ${response.statusText}`);
      }

      setScenarioState(responseBody.scenario);

      if (path === "/api/scenario/reset") {
        applyDeviceListeningState(false, { clearIgnoredEvents: true });
      }
    } catch (scenarioError) {
      setError(scenarioError instanceof Error ? scenarioError.message : "Scenario command failed.");
    } finally {
      setIsScenarioBusy(false);
    }
  }

  async function clearEvents() {
    setIsClearingEvents(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/events"), {
        method: "DELETE"
      });
      const body = (await response.json()) as ClearEventsResponse;

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }

      setEvents([]);
      setCalls([]);
      setDismissedAlertEventIds(new Set());
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear events.");
    } finally {
      setIsClearingEvents(false);
    }
  }

  async function clearAlerts() {
    const eventToDismiss = activeAlertEvent;

    if (!eventToDismiss && calls.length === 0) {
      return;
    }

    setIsClearingAlerts(true);
    setError(null);

    try {
      const response = await fetch(apiUrl("/api/calls"), {
        method: "DELETE"
      });
      const body = (await response.json()) as ClearAlertsResponse;

      if (!response.ok || !body.ok) {
        throw new Error(body.error ?? `${response.status} ${response.statusText}`);
      }

      setCalls([]);
      if (eventToDismiss) {
        setDismissedAlertEventIds((currentIds) => new Set(currentIds).add(eventToDismiss.eventId));
      }
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Could not clear alerts.");
    } finally {
      setIsClearingAlerts(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <aside className="left-rail">
        <div className="brand-block">
          <div>
            <p className="eyebrow">Edge AI monitor</p>
            <h1 className="brand-name">
              gu<span className="brand-ai">A<span className="brand-i">I</span></span>ta
            </h1>
          </div>
          <span className={`status-pill ${connectionState}`}>
            {connectionState === "connected" ? <Wifi size={14} /> : <WifiOff size={14} />}
            {connectionState}
          </span>
        </div>

        <section className="panel-section">
          <div className="section-heading section-heading-action">
            <div className="section-heading-label">
              <Clock3 size={16} />
              <h2>Scenario</h2>
            </div>
            <label className="device-listen-toggle" title="Accept incoming device detections">
              <span>Listen from device</span>
              <input
                checked={listenFromDevice}
                disabled={isSettingDeviceListening}
                type="checkbox"
                onChange={(event) => void setDeviceListening(event.target.checked, { clearIgnoredEvents: event.target.checked })}
              />
              <i aria-hidden="true" />
            </label>
          </div>
          <div className="scenario-state">
            <span>night-to-day patrol</span>
            <strong>{formatScenarioClock(scenarioState)}</strong>
            <div className="scenario-progress" aria-hidden="true">
              <span style={{ width: `${scenarioProgress(scenarioState)}%` }} />
            </div>
            <div className="scenario-scale">
              <span>{formatScenarioBoundary(scenarioState?.virtualStartIso, "2026-04-25T02:30:00.000Z")}</span>
              <span>{formatScenarioBoundary(scenarioState?.virtualEndIso, "2026-04-25T08:30:00.000Z")}</span>
            </div>
            <div className="scenario-meta">
              <span>{scenarioState?.status ?? "idle"}</span>
              <span>{scenarioState?.speedMultiplier ?? 120}x</span>
            </div>
          </div>
          <div className="scenario-controls">
            <button
              className="control-button"
              type="button"
              onClick={() => runScenarioCommand("/api/scenario/start")}
              disabled={isScenarioBusy || scenarioState?.status === "running"}
              title="Start scenario clock"
            >
              <Play size={15} />
              Start
            </button>
            <button
              className="control-button"
              type="button"
              onClick={() => runScenarioCommand(scenarioState?.status === "paused" ? "/api/scenario/resume" : "/api/scenario/pause")}
              disabled={isScenarioBusy || !scenarioState || scenarioState.status === "idle" || scenarioState.status === "completed"}
              title={scenarioState?.status === "paused" ? "Resume scenario clock" : "Pause scenario clock"}
            >
              {scenarioState?.status === "paused" ? <Play size={15} /> : <Pause size={15} />}
              {scenarioState?.status === "paused" ? "Resume" : "Pause"}
            </button>
            <button
              className="control-button icon-only"
              type="button"
              onClick={() => runScenarioCommand("/api/scenario/advance", { minutes: 15 })}
              disabled={isScenarioBusy || !scenarioState || scenarioState.status === "completed"}
              title="Advance scenario by 15 minutes"
            >
              <FastForward size={15} />
              Skip
            </button>
            <button
              className="control-button icon-only"
              type="button"
              onClick={() => runScenarioCommand("/api/scenario/reset")}
              disabled={isScenarioBusy}
              title="Reset scenario clock"
            >
              <RotateCcw size={15} />
              Reset
            </button>
          </div>
          <div className="speed-control" aria-label="Scenario speed">
            {scenarioSpeedOptions.map((speed) => (
              <button
                className={scenarioState?.speedMultiplier === speed ? "selected" : ""}
                key={speed}
                type="button"
                onClick={() => runScenarioCommand("/api/scenario/speed", { speedMultiplier: speed })}
                disabled={isScenarioBusy}
              >
                {speed}x
              </button>
            ))}
          </div>
          <button className="primary-button" type="button" onClick={simulateDetection} disabled={isPosting} title="Create manual detection">
            <RadioTower size={18} />
            {isPosting ? "Sending" : "Simulate detection"}
          </button>
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <Activity size={16} />
            <h2>Network</h2>
          </div>
          <div className="network-strip">
            <div className="network-stat">
              <span>Stations</span>
              <strong>{stations.length}</strong>
            </div>
            <div className="network-stat">
              <span>Online</span>
              <strong>{activeStationCount}</strong>
            </div>
            <div className="network-stat">
              <span>Zones</span>
              <strong>{zones.length}</strong>
            </div>
            <div className="network-stat">
              <span>Telemetry</span>
              <strong>{telemetryStationCount}</strong>
            </div>
          </div>
        </section>

        <section className="panel-section station-panel">
          <div className="section-heading">
            <MapPin size={16} />
            <h2>Stations</h2>
          </div>
          <div className="station-list" ref={stationListRef}>
            {sortedStations.map((station) => {
              const telemetry = latestTelemetryByStation.get(station.id);
              const batteryPct = telemetry?.batteryPct ?? station.batteryPct;
              const stationIsDevice = isDeviceStation(station);
              const stationIsRisk = isRiskControlStation(station);

              return (
                <article className="station-card" data-station-id={station.id} key={station.id}>
                  <button
                    className="station-row"
                    type="button"
                    aria-expanded={expandedStationId === station.id}
                    onClick={() => setExpandedStationId((currentId) => (currentId === station.id ? null : station.id))}
                  >
                    <span
                      className={`station-dot ${station.status} ${stationIsRisk ? "risk" : ""} ${
                        stationIsDevice ? "device" : ""
                      }`}
                    />
                    <div>
                      <strong>{station.name}</strong>
                      <span>{stationIsDevice ? "device" : telemetry ? "telemetry" : stationIsRisk ? "risk" : station.type}</span>
                    </div>
                    <em>{formatBattery(batteryPct)}</em>
                    <ChevronDown className="station-chevron" size={15} />
                  </button>
                  <div className={expandedStationId === station.id ? "station-details open" : "station-details"}>
                    <dl>
                      <div>
                        <dt>Status</dt>
                        <dd>{station.status}</dd>
                      </div>
                      <div>
                        <dt>Station ID</dt>
                        <dd>{station.id}</dd>
                      </div>
                      <div>
                        <dt>Zone</dt>
                        <dd>{station.zoneId ?? "unassigned"}</dd>
                      </div>
                      <div>
                        <dt>Location</dt>
                        <dd>{station.latitude.toFixed(4)}, {station.longitude.toFixed(4)}</dd>
                      </div>
                    </dl>
                    {telemetry ? (
                      <div className="telemetry-grid" aria-label={`Latest telemetry for ${station.name}`}>
                        <div>
                          <Thermometer size={14} />
                          <span>{formatTemperature(telemetry.temperatureC)}</span>
                        </div>
                        <div>
                          <Droplets size={14} />
                          <span>{formatHumidity(telemetry.humidityPct)}</span>
                        </div>
                        <div>
                          <Sun size={14} />
                          <span>{formatLight(telemetry.lightLux)}</span>
                        </div>
                        <div>
                          <Battery size={14} />
                          <span>{formatBattery(telemetry.batteryPct)}</span>
                        </div>
                        <div>
                          <Signal size={14} />
                          <span>{formatSignal(telemetry.rssiDbm)}</span>
                        </div>
                        <div>
                          <Clock3 size={14} />
                          <span>{formatTime(telemetry.observedAt)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="station-telemetry-empty">No sensor reading yet</div>
                    )}
                    {station.description ? <p>{station.description}</p> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {error ? <div className="error-banner">{error}</div> : null}
      </aside>

      <MapPanel stations={stations} zones={zones} events={events} />

      <aside className="right-rail">
        <section className="panel-section latest-panel">
          <div className="section-heading">
            <ShieldAlert size={16} />
            <h2>Latest Detection</h2>
          </div>
          {latestEvent ? (
            <div className="latest-event">
              <div className="latest-head">
                <span className={`source-badge ${latestEvent.source}`}>{latestEvent.source}</span>
                <strong>{percent(latestEvent.confidence)}</strong>
              </div>
              <h3>{stationLabel(latestEvent.stationId, stationById)}</h3>
              <dl>
                <div>
                  <dt>Observed</dt>
                  <dd>{formatTime(latestEvent.observedAt)}</dd>
                </div>
                <div>
                  <dt>Direction</dt>
                  <dd>{latestEvent.direction ?? "unknown"}</dd>
                </div>
                <div>
                  <dt>Temperature</dt>
                  <dd>{formatTemperature(latestEvent.temperatureC)}</dd>
                </div>
                <div>
                  <dt>Humidity</dt>
                  <dd>{formatHumidity(latestEvent.humidityPct)}</dd>
                </div>
                <div>
                  <dt>Light</dt>
                  <dd>{formatLight(latestEvent.lightLux)}</dd>
                </div>
                <div>
                  <dt>Battery</dt>
                  <dd>{formatBattery(latestEvent.batteryPct)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="empty-state">No detections yet</div>
          )}
        </section>

        <section className="panel-section alert-tracking-panel">
          <div className="section-heading section-heading-action">
            <div className="section-heading-label">
              <BellRing size={16} />
              <h2>Alert Tracking</h2>
            </div>
            <button
              className="quiet-button compact-button"
              type="button"
              onClick={clearAlerts}
              disabled={(!activeAlertEvent && calls.length === 0) || isClearingAlerts}
              title="Clear current alert tracking"
            >
              <Trash2 size={13} />
              {isClearingAlerts ? "Clearing" : "Clear alerts"}
            </button>
          </div>
          <div className="alert-tracking-list">
            {alertTrackingItems.length ? (
              alertTrackingItems.map((item) => (
                <article className={`alert-tracking-item ${item.tone}`} key={item.id}>
                  <div className="alert-tracking-icon">
                    {item.tone === "standby" ? <CheckCircle2 size={15} /> : <PhoneCall size={15} />}
                  </div>
                  <div>
                    <div className="alert-tracking-head">
                      <strong>{item.title}</strong>
                      <span>{item.status}</span>
                    </div>
                    <p>{item.target}</p>
                    <em>{item.detail}</em>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state alert-empty">No active alert</div>
            )}
          </div>
          <button
            className="escalation-button"
            type="button"
            onClick={callCivilProtection}
            disabled={!canCallCivilProtection || isCallingCivilProtection}
            title="Call the configured Civil Protection demo recipient"
          >
            <PhoneCall size={16} />
            {civilProtectionCallLabel}
          </button>
          {latestCall ? (
            <div className={`call-status-card ${latestCall.status}`}>
              <div className="call-status-top">
                <div>
                  <span>Voice escalation</span>
                  <strong>{callStatusLabel(latestCall)}</strong>
                </div>
                <em>{formatTime(latestCall.updatedAt)}</em>
              </div>
              <p className="call-status-summary">{callStatusDetail(latestCall)}</p>
              <div className={`call-next-action ${latestCall.status}`}>
                <strong>{callNextAction(latestCall).title}</strong>
                <span>{callNextAction(latestCall).detail}</span>
              </div>
              <ol className="call-stage-list" aria-label="Civil Protection call lifecycle">
                {callLifecycleStages(latestCall).map((stage) => (
                  <li className={`call-stage ${stage.state}`} key={stage.id}>
                    <span className="call-stage-dot" aria-hidden="true" />
                    <div className="call-stage-body">
                      <div className="call-stage-row">
                        <strong>{stage.label}</strong>
                        <span>{stage.timeLabel}</span>
                      </div>
                      <p>{stage.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <dl className="call-meta">
                <div>
                  <dt>Provider</dt>
                  <dd>{latestCall.provider}</dd>
                </div>
                <div>
                  <dt>Recipient</dt>
                  <dd>{redactedPhone(latestCall.toNumber)}</dd>
                </div>
                <div>
                  <dt>Incident</dt>
                  <dd>{shortIdentifier(latestCall.eventId)}</dd>
                </div>
                <div>
                  <dt>Conversation</dt>
                  <dd>{shortIdentifier(latestCall.conversationId)}</dd>
                </div>
                <div>
                  <dt>Call SID</dt>
                  <dd>{shortIdentifier(latestCall.callSid)}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatTime(latestCall.createdAt)}</dd>
                </div>
              </dl>
              {latestCall.transcriptSummary ? (
                <div className="call-transcript-summary">
                  <span>Transcript summary</span>
                  <p>{latestCall.transcriptSummary}</p>
                </div>
              ) : null}
              {latestCall.status !== "acknowledged" ? (
                <button
                  className="quiet-button call-status-action"
                  type="button"
                  onClick={markCallHandled}
                  disabled={isMarkingCallHandled}
                  title="Mark Civil Protection response as handled in the dashboard"
                >
                  <CheckCircle2 size={14} />
                  {isMarkingCallHandled
                    ? "Marking"
                    : latestCall.status === "failed"
                      ? "Mark handled manually"
                      : "Mark handled"}
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

      </aside>

      <section className="timeline-panel">
        <div className="timeline-heading">
          <div>
            <h2>Detection Feed</h2>
            <span>{events.length ? `${events.length} stored` : "waiting"}</span>
          </div>
          <button
            className="quiet-button compact-button"
            type="button"
            onClick={clearEvents}
            disabled={events.length === 0 || isClearingEvents}
            title="Clear stored demo events"
          >
            <Trash2 size={13} />
            {isClearingEvents ? "Clearing" : "Clear"}
          </button>
        </div>
        <div className="timeline-track">
          {events.slice(0, 12).map((event) => (
            <article className={`timeline-item ${event.source}`} key={event.eventId}>
              <span className="timeline-dot" />
              <span>{formatTime(event.observedAt)}</span>
              <strong>{stationLabel(event.stationId, stationById)}</strong>
              <em>{event.source}</em>
              <b>{percent(event.confidence)}</b>
            </article>
          ))}
          {events.length === 0 ? <div className="empty-state timeline-empty">No events stored</div> : null}
        </div>
      </section>
    </main>
  );
}
