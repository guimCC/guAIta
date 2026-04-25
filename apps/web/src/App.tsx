import {
  Activity,
  Clock3,
  MapPin,
  RadioTower,
  ShieldAlert,
  Wifi,
  WifiOff
} from "lucide-react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  SOCKET_EVENTS,
  type DetectionEvent,
  type Station,
  type Zone
} from "@guaita/shared";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { apiBaseUrl, getMapStyleUrl, mapInitialView, socketUrl } from "./mapConfig";

type ConnectionState = "connecting" | "connected" | "offline";

interface StationsResponse {
  stations: Station[];
}

interface ZonesResponse {
  zones: Zone[];
}

interface EventsResponse {
  events: DetectionEvent[];
}

interface CreateEventResponse {
  ok: boolean;
  event?: DetectionEvent;
  eventId?: string;
  error?: string;
}

const emptyPointCollection: FeatureCollection<Point> = {
  type: "FeatureCollection",
  features: []
};

const emptyPolygonCollection: FeatureCollection<Polygon> = {
  type: "FeatureCollection",
  features: []
};

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

function stationLabel(stationId: string, stationById: Map<string, Station>): string {
  return stationById.get(stationId)?.name ?? stationId;
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

function buildEventFeatures(events: DetectionEvent[], stationById: Map<string, Station>): FeatureCollection<Point> {
  const features: Feature<Point>[] = [];

  for (const event of events.slice(0, 40)) {
    const station = stationById.get(event.stationId);
    if (!station) {
      continue;
    }

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
        observedAt: event.observedAt
      }
    });
  }

  return {
    type: "FeatureCollection",
    features
  };
}

function setSourceData(map: MapLibreMap, sourceId: string, data: FeatureCollection<Point> | FeatureCollection<Polygon>): void {
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

  const stationById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const stationFeatures = useMemo(() => buildStationFeatures(stations), [stations]);
  const zoneFeatures = useMemo(() => buildZoneFeatures(zones), [zones]);
  const eventFeatures = useMemo(() => buildEventFeatures(events, stationById), [events, stationById]);

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
            "match",
            ["get", "type"],
            "frontier",
            "#f59e0b",
            "containment",
            "#84cc16",
            "urban",
            "#ef4444",
            "#22c55e"
          ],
          "circle-radius": [
            "match",
            ["get", "status"],
            "degraded",
            7,
            "offline",
            6,
            8
          ],
          "circle-stroke-color": "#1c1917",
          "circle-stroke-width": 2
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
          "circle-opacity": 0.28,
          "circle-radius": ["interpolate", ["linear"], ["get", "confidence"], 0, 16, 1, 34]
        }
      });
      map.addLayer({
        id: "event-dots",
        type: "circle",
        source: "events",
        paint: {
          "circle-color": "#fef3c7",
          "circle-radius": 5,
          "circle-stroke-color": "#7f1d1d",
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
    setSourceData(map, "events", eventFeatures);
  }, [eventFeatures, mapReady, stationFeatures, zoneFeatures]);

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
  const [stations, setStations] = useState<Station[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);

  const stationById = useMemo(() => new Map(stations.map((station) => [station.id, station])), [stations]);
  const latestEvent = events[0];
  const activeStationCount = stations.filter((station) => station.status === "online").length;

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [stationResponse, zoneResponse, eventResponse] = await Promise.all([
          fetchJson<StationsResponse>("/api/stations"),
          fetchJson<ZonesResponse>("/api/zones"),
          fetchJson<EventsResponse>("/api/events?limit=50")
        ]);

        if (!isMounted) {
          return;
        }

        setStations(stationResponse.stations);
        setZones(zoneResponse.zones);
        setEvents(eventResponse.events);
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
      setEvents((currentEvents) => upsertEvent(currentEvents, event));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  async function simulateDetection() {
    const targetStation =
      stations.find((station) => station.id === "frontier-gate-01") ??
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
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : "Simulation failed.");
    } finally {
      setIsPosting(false);
    }
  }

  return (
    <main className="dashboard-shell">
      <aside className="left-rail">
        <div className="brand-block">
          <div>
            <p className="eyebrow">Edge AI monitoring</p>
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
          <div className="section-heading">
            <Clock3 size={16} />
            <h2>Scenario</h2>
          </div>
          <div className="scenario-state">
            <span>morning-frontier-breach</span>
            <strong>standby</strong>
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
          <div className="metric-grid">
            <div className="metric-card">
              <span>Stations</span>
              <strong>{stations.length}</strong>
            </div>
            <div className="metric-card">
              <span>Online</span>
              <strong>{activeStationCount}</strong>
            </div>
            <div className="metric-card">
              <span>Zones</span>
              <strong>{zones.length}</strong>
            </div>
            <div className="metric-card">
              <span>Events</span>
              <strong>{events.length}</strong>
            </div>
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
                  <dt>Humidity</dt>
                  <dd>{latestEvent.humidityPct ? `${latestEvent.humidityPct}%` : "n/a"}</dd>
                </div>
                <div>
                  <dt>Light</dt>
                  <dd>{latestEvent.lightLux ? `${latestEvent.lightLux} lux` : "n/a"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="empty-state">No detections yet</div>
          )}
        </section>

        <section className="panel-section">
          <div className="section-heading">
            <MapPin size={16} />
            <h2>Stations</h2>
          </div>
          <div className="station-list">
            {stations.map((station) => (
              <div className="station-row" key={station.id}>
                <span className={`station-dot ${station.status}`} />
                <div>
                  <strong>{station.name}</strong>
                  <span>{station.type}</span>
                </div>
                <em>{station.batteryPct ?? 0}%</em>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="timeline-panel">
        <div className="timeline-heading">
          <h2>Event Timeline</h2>
          <span>{events.length ? `${events.length} stored` : "waiting"}</span>
        </div>
        <div className="timeline-track">
          {events.slice(0, 8).map((event) => (
            <article className="timeline-item" key={event.eventId}>
              <span className={`source-badge ${event.source}`}>{event.source}</span>
              <strong>{stationLabel(event.stationId, stationById)}</strong>
              <span>{formatTime(event.observedAt)}</span>
              <span>{percent(event.confidence)}</span>
            </article>
          ))}
          {events.length === 0 ? <div className="empty-state timeline-empty">No events stored</div> : null}
        </div>
      </section>
    </main>
  );
}
