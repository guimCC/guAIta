import {
  Activity,
  AlertTriangle,
  Battery,
  BellRing,
  CheckCircle2,
  Clock3,
  Droplets,
  Gauge,
  RadioTower,
  ShieldCheck,
  Signal,
  Sun,
  Thermometer,
  Wifi,
  WifiOff
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { apiBaseUrl, socketUrl } from "./mapConfig";

type ConnectionState = "connecting" | "connected" | "offline";
type PublicRiskTone = "normal" | "watch" | "elevated" | "critical";

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

interface CallsResponse {
  calls: CivilProtectionCall[];
}

interface ScenarioResponse {
  scenario: ScenarioState;
}

interface PublicRiskStatus {
  tone: PublicRiskTone;
  label: string;
  summary: string;
  advisory: string;
}

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

function upsertTelemetry(readings: TelemetryReading[], reading: TelemetryReading): TelemetryReading[] {
  return [reading, ...readings.filter((existing) => existing.telemetryId !== reading.telemetryId)].slice(0, 200);
}

function upsertCall(calls: CivilProtectionCall[], call: CivilProtectionCall): CivilProtectionCall[] {
  return [call, ...calls.filter((existing) => existing.id !== call.id)].slice(0, 50);
}

function formatTime(value: string | undefined): string {
  if (!value) {
    return "No detections";
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelativeTime(value: string | undefined): string {
  if (!value) {
    return "No recent update";
  }

  const diffMs = Date.now() - new Date(value).getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.max(1, Math.round(absMs / 60_000));

  if (minutes < 60) {
    return diffMs >= 0 ? `${minutes} min ago` : "just now";
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }

  return `${Math.round(hours / 24)} d ago`;
}

function average(values: Array<number | undefined>): number | undefined {
  const cleanValues = values.filter((value): value is number => typeof value === "number");

  if (cleanValues.length === 0) {
    return undefined;
  }

  return cleanValues.reduce((sum, value) => sum + value, 0) / cleanValues.length;
}

function formatNumber(value: number | undefined, suffix = ""): string {
  return value === undefined ? "n/a" : `${Math.round(value)}${suffix}`;
}

function isWithin(event: DetectionEvent, minutes: number): boolean {
  const observedAt = new Date(event.observedAt).getTime();
  const diffMs = Date.now() - observedAt;

  return diffMs >= -60_000 && diffMs <= minutes * 60_000;
}

function publicAreaForStation(station: Station | undefined): string {
  if (!station) {
    return "Collserola sector";
  }

  if (station.type === "urban") {
    return "Urban edge";
  }

  if (station.type === "frontier") {
    return "Access corridor";
  }

  if (station.longitude < 2.06) {
    return "Western forest edge";
  }

  if (station.longitude > 2.14) {
    return "Eastern urban edge";
  }

  if (station.latitude > 41.47) {
    return "Northern park edge";
  }

  return "Central Collserola sector";
}

function publicEventTitle(event: DetectionEvent): string {
  if (event.source === "device") {
    return "Edge AI detection received";
  }

  if (event.source === "scenario") {
    return "Scenario signal updated";
  }

  return "Operator report logged";
}

function riskStatus(events: DetectionEvent[], calls: CivilProtectionCall[]): PublicRiskStatus {
  const recent15 = events.filter((event) => isWithin(event, 15));
  const recent60 = events.filter((event) => isWithin(event, 60));
  const latest = events[0];
  const highConfidence = recent60.some((event) => event.confidence >= 0.88);
  const activeResponse = calls.some((call) => ["requested", "calling", "completed"].includes(call.status));

  if (recent15.length >= 3 || (activeResponse && highConfidence)) {
    return {
      tone: "critical",
      label: "Active response",
      summary: "Multiple signals are being reviewed by the response team.",
      advisory: "Use signed paths and avoid approaching wildlife."
    };
  }

  if (highConfidence || recent60.length >= 2) {
    return {
      tone: "elevated",
      label: "Elevated watch",
      summary: "Recent activity is concentrated near park edge sectors.",
      advisory: "Stay aware around forest access points."
    };
  }

  if (latest) {
    return {
      tone: "watch",
      label: "Monitoring",
      summary: "The network is receiving low-volume wildlife signals.",
      advisory: "Normal public access with standard caution."
    };
  }

  return {
    tone: "normal",
    label: "Normal",
    summary: "No active wild boar incident is reported by the network.",
    advisory: "Normal public access."
  };
}

function connectionLabel(connectionState: ConnectionState): string {
  switch (connectionState) {
    case "connected":
      return "Live";
    case "offline":
      return "Offline";
    case "connecting":
      return "Connecting";
  }
}

function scenarioLabel(scenarioState: ScenarioState | null): string {
  if (!scenarioState || scenarioState.status === "idle") {
    return "Live monitoring";
  }

  if (scenarioState.status === "running") {
    return "Demo scenario running";
  }

  if (scenarioState.status === "paused") {
    return "Demo scenario paused";
  }

  return "Demo scenario complete";
}

export function PublicStatusPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [telemetryReadings, setTelemetryReadings] = useState<TelemetryReading[]>([]);
  const [calls, setCalls] = useState<CivilProtectionCall[]>([]);
  const [scenarioState, setScenarioState] = useState<ScenarioState | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

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

  const recent15Count = useMemo(() => events.filter((event) => isWithin(event, 15)).length, [events]);
  const recent24hCount = useMemo(() => events.filter((event) => isWithin(event, 24 * 60)).length, [events]);
  const latestEvent = events[0];
  const activeCalls = calls.filter((call) => ["requested", "calling", "completed"].includes(call.status)).length;
  const status = useMemo(() => riskStatus(events, calls), [calls, events]);
  const onlineStations = stations.filter((station) => station.status === "online").length;
  const degradedStations = stations.filter((station) => station.status === "degraded").length;
  const avgBattery = average([
    ...stations.map((station) => station.batteryPct),
    ...telemetryReadings.map((reading) => reading.batteryPct)
  ]);
  const avgTemperature = average(telemetryReadings.map((reading) => reading.temperatureC));
  const avgHumidity = average(telemetryReadings.map((reading) => reading.humidityPct));
  const avgLight = average(telemetryReadings.map((reading) => reading.lightLux));
  const strongestSignal = average(telemetryReadings.map((reading) => reading.rssiDbm));
  const publicUpdates = events.slice(0, 5);

  useEffect(() => {
    document.title = "guAIta Public Status";
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [stationResponse, zoneResponse, eventResponse, telemetryResponse, callResponse, scenarioResponse] = await Promise.all([
          fetchJson<StationsResponse>("/api/stations"),
          fetchJson<ZonesResponse>("/api/zones"),
          fetchJson<EventsResponse>("/api/events?limit=100"),
          fetchJson<TelemetryResponse>("/api/telemetry/latest"),
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
        setCalls(callResponse.calls);
        setScenarioState(scenarioResponse.scenario);
        setLastUpdatedAt(new Date().toISOString());
        setError(null);
      } catch (loadError) {
        if (isMounted) {
          setError(loadError instanceof Error ? loadError.message : "Could not load public status.");
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
      setEvents((currentEvents) => upsertEvent(currentEvents, event));
      setLastUpdatedAt(new Date().toISOString());
    });
    socket.on(SOCKET_EVENTS.telemetryCreated, (reading: TelemetryReading) => {
      setTelemetryReadings((currentReadings) => upsertTelemetry(currentReadings, reading));
      setLastUpdatedAt(new Date().toISOString());
    });
    socket.on(SOCKET_EVENTS.eventsCleared, () => {
      setEvents([]);
      setLastUpdatedAt(new Date().toISOString());
    });
    socket.on(SOCKET_EVENTS.callUpdated, (call: CivilProtectionCall) => {
      setCalls((currentCalls) => upsertCall(currentCalls, call));
      setLastUpdatedAt(new Date().toISOString());
    });
    socket.on(SOCKET_EVENTS.callsCleared, () => {
      setCalls([]);
      setLastUpdatedAt(new Date().toISOString());
    });
    socket.on(SOCKET_EVENTS.scenarioUpdated, (state: ScenarioState) => {
      setScenarioState(state);
      setLastUpdatedAt(new Date().toISOString());
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <main className="public-status-page">
      <header className="public-status-header">
        <div>
          <p className="public-eyebrow">Collserola public status</p>
          <h1 className="brand-name">
            gu<span className="brand-ai">A<span className="brand-i">I</span></span>ta
          </h1>
        </div>
        <div className={`public-live-pill ${connectionState}`}>
          {connectionState === "connected" ? <Wifi size={16} /> : <WifiOff size={16} />}
          {connectionLabel(connectionState)}
        </div>
      </header>

      <section className={`public-risk-band ${status.tone}`} aria-label="Current public risk status">
        <div className="public-risk-main">
          <div className="public-risk-icon">
            {status.tone === "normal" ? <ShieldCheck size={30} /> : <AlertTriangle size={30} />}
          </div>
          <div>
            <p className="public-eyebrow">Current status</p>
            <h2>{status.label}</h2>
            <p>{status.summary}</p>
          </div>
        </div>
        <div className="public-advisory">
          <span>Resident advisory</span>
          <strong>{status.advisory}</strong>
        </div>
      </section>

      {error ? (
        <section className="public-error" role="alert">
          <AlertTriangle size={18} />
          {error}
        </section>
      ) : null}

      <section className="public-metrics-grid" aria-label="Public metrics">
        <article className="public-metric">
          <Activity size={20} />
          <span>Last 15 min</span>
          <strong>{recent15Count}</strong>
        </article>
        <article className="public-metric">
          <Gauge size={20} />
          <span>24h detections</span>
          <strong>{recent24hCount}</strong>
        </article>
        <article className="public-metric">
          <RadioTower size={20} />
          <span>Stations online</span>
          <strong>
            {onlineStations}/{stations.length}
          </strong>
        </article>
        <article className="public-metric">
          <Battery size={20} />
          <span>Avg battery</span>
          <strong>{formatNumber(avgBattery, "%")}</strong>
        </article>
        <article className="public-metric">
          <BellRing size={20} />
          <span>Response state</span>
          <strong>{activeCalls > 0 ? "Active" : "Standby"}</strong>
        </article>
        <article className="public-metric">
          <Clock3 size={20} />
          <span>Last signal</span>
          <strong>{formatTime(latestEvent?.observedAt)}</strong>
        </article>
      </section>

      <section className="public-content-grid">
        <article className="public-panel public-activity-panel">
          <div className="public-panel-heading">
            <div>
              <p className="public-eyebrow">Anonymized activity</p>
              <h2>Recent public updates</h2>
            </div>
            <span>{scenarioLabel(scenarioState)}</span>
          </div>
          <div className="public-update-list">
            {publicUpdates.length > 0 ? (
              publicUpdates.map((event) => {
                const station = stationById.get(event.stationId);
                return (
                  <div className="public-update-row" key={event.eventId}>
                    <div className={`public-update-dot ${event.source}`} />
                    <div>
                      <strong>{publicEventTitle(event)}</strong>
                      <span>
                        {publicAreaForStation(station)} · {Math.round(event.confidence * 100)}% confidence
                      </span>
                    </div>
                    <time>{formatRelativeTime(event.observedAt)}</time>
                  </div>
                );
              })
            ) : (
              <div className="public-empty-state">
                <CheckCircle2 size={20} />
                No public wildlife activity is currently listed.
              </div>
            )}
          </div>
        </article>

        <article className="public-panel">
          <div className="public-panel-heading">
            <div>
              <p className="public-eyebrow">Network health</p>
              <h2>Monitoring coverage</h2>
            </div>
            <span>{degradedStations} degraded</span>
          </div>
          <div className="public-coverage-stack">
            <div>
              <span>Online stations</span>
              <strong>{stations.length ? Math.round((onlineStations / stations.length) * 100) : 0}%</strong>
              <div className="public-progress-track">
                <span style={{ width: `${stations.length ? (onlineStations / stations.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <span>Telemetry freshness</span>
              <strong>
                {stations.length ? Math.round((latestTelemetryByStation.size / stations.length) * 100) : 0}%
              </strong>
              <div className="public-progress-track amber">
                <span style={{ width: `${stations.length ? (latestTelemetryByStation.size / stations.length) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <span>Covered public zones</span>
              <strong>{zones.length}</strong>
              <div className="public-zone-tags">
                {zones.slice(0, 3).map((zone) => (
                  <em key={zone.id}>{zone.name}</em>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="public-panel">
          <div className="public-panel-heading">
            <div>
              <p className="public-eyebrow">Environment</p>
              <h2>Latest sensor averages</h2>
            </div>
            <span>{latestTelemetryByStation.size} reporting</span>
          </div>
          <div className="public-sensor-grid">
            <div>
              <Thermometer size={18} />
              <span>Temp</span>
              <strong>{avgTemperature === undefined ? "n/a" : `${avgTemperature.toFixed(1)} C`}</strong>
            </div>
            <div>
              <Droplets size={18} />
              <span>Humidity</span>
              <strong>{formatNumber(avgHumidity, "%")}</strong>
            </div>
            <div>
              <Sun size={18} />
              <span>Light</span>
              <strong>{formatNumber(avgLight, " lx")}</strong>
            </div>
            <div>
              <Signal size={18} />
              <span>Signal</span>
              <strong>{formatNumber(strongestSignal, " dBm")}</strong>
            </div>
          </div>
        </article>
      </section>

      <footer className="public-status-footer">
        <span>Public information view</span>
        <span>Updated {formatRelativeTime(lastUpdatedAt ?? latestEvent?.observedAt)}</span>
      </footer>
    </main>
  );
}
