import {
  Activity,
  ArrowLeft,
  Clock3,
  Search,
  ShieldAlert,
  Zap,
  BarChart3,
  Thermometer,
  MapPin,
  Wifi
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import {
  type DetectionEvent,
  type TelemetryReading,
  type Station,
  type Zone
} from "@guaita/shared";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { apiBaseUrl, getMapStyleUrl, mapInitialView } from "../src/mapConfig";

// Style Constants from Dashboard
const shellStyles = {
  background: 'linear-gradient(90deg, rgba(28, 25, 23, 0.98), rgba(30, 41, 31, 0.92)), #171412'
};

function apiUrl(path: string): string {
  return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path));
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

// Reuse Map logic from src/App.tsx
function buildStationFeatures(stations: Station[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
      properties: { id: s.id, name: s.name, type: s.type, status: s.status }
    }))
  };
}

function SummaryMap({ stations, events }: { stations: Station[], events: DetectionEvent[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: mapInitialView.center,
      zoom: mapInitialView.zoom,
      attributionControl: false
    });

    map.on("load", () => {
      // 1. Heat Detections Layer (True Heatmap)
      map.addSource("events", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "events-heatmap",
        type: "heatmap",
        source: "events",
        maxzoom: 15,
        paint: {
          // Increase the heatmap weight based on frequency and property 'count'
          "heatmap-weight": ["interpolate", ["linear"], ["get", "count"], 0, 0, 10, 1],
          // Increase the heatmap color weight weight by zoom level
          // heatmap-intensity is a multiplier on top of heatmap-weight
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 15, 3],
          // Color ramp for heatmap
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(33,102,172,0)",
            0.2, "rgb(103,169,207)",
            0.4, "rgb(209,229,240)",
            0.6, "rgb(253,219,199)",
            0.8, "rgb(239,138,98)",
            1, "rgb(178,24,43)"
          ],
          // Adjust the heatmap radius by zoom level
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 2, 15, 20],
          // Transition from heatmap to circle layer by zoom level
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 1, 15, 0.5]
        }
      });

      // Add a circle layer for events at high zoom
      map.addLayer({
        id: "events-point",
        type: "circle",
        source: "events",
        minzoom: 13,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 13, 3, 15, 8],
          "circle-color": "rgb(178,24,43)",
          "circle-stroke-color": "white",
          "circle-stroke-width": 1,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15, 1]
        }
      });

      // 2. Stations Layer (Matching Dashboard Colors)
      map.addSource("stations", { 
        type: "geojson", 
        data: { type: "FeatureCollection", features: stations.map(s => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [s.longitude, s.latitude] },
          properties: { type: s.type, status: s.status }
        }))} 
      });
      map.addLayer({
        id: "stations",
        type: "circle",
        source: "stations",
        paint: {
          "circle-color": ["match", ["get", "type"], "frontier", "#f59e0b", "containment", "#84cc16", "urban", "#ef4444", "#22c55e"],
          "circle-radius": 6,
          "circle-stroke-color": "#1c1917",
          "circle-stroke-width": 2
        }
      });
    });
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    const source = mapRef.current.getSource("events") as GeoJSONSource;
    if (source) {
      const stationById = new Map(stations.map(s => [s.id, s]));
      const features: Feature<Point>[] = events.slice(0, 50).map(e => {
        const s = stationById.get(e.stationId);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: [s?.longitude || 0, s?.latitude || 0] },
          properties: { count: e.count }
        };
      });
      source.setData({ type: "FeatureCollection", features });
    }
  }, [events, stations]);

  return <section className="map-panel"><div ref={containerRef} className="map-container" /></section>;
}

export function App() {
  const [stations, setStations] = useState<Station[]>([]);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [analysis, setAnalysis] = useState<string>("");
  const [metrics, setMetrics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const [stationRes, eventRes, analysisRes] = await Promise.all([
        fetchJson<{ stations: Station[] }>("/api/stations"),
        fetchJson<{ events: DetectionEvent[] }>("/api/events?limit=500"),
        fetchJson<{ ok: boolean, analysis: string, metrics: any }>("/api/summary/expert-analysis")
      ]);
      setStations(stationRes.stations);
      setEvents(eventRes.events);
      setAnalysis(analysisRes.analysis);
      setMetrics(analysisRes.metrics);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  if (loading) return <div className="dashboard-shell" style={{ display: 'grid', placeItems: 'center' }}>Loading expert insights...</div>;

  return (
    <main className="dashboard-shell">
      {/* LEFT RAIL: Brand & Key Stats */}
      <aside className="left-rail">
        <div className="brand-block">
          <div>
             <a href="/" style={{ textDecoration: 'none' }}>
                <p className="eyebrow">Edge AI monitoring</p>
                <h1 className="brand-name">gu<span className="brand-ai">A<span className="brand-i">I</span></span>ta</h1>
             </a>
          </div>
          <span className="status-pill connected"><Wifi size={14} /> Analysis Mode</span>
        </div>

        <section className="panel-section">
           <div className="section-heading"><ShieldAlert size={16} /> <h2>Risk Metrics</h2></div>
           <div className="metric-grid">
              <div className="metric-card">
                 <span>Daylight Activity</span>
                 <strong style={{ color: (metrics?.daylightPct || 0) > 15 ? '#ef4444' : '#22c55e' }}>{metrics?.daylightPct}%</strong>
              </div>
              <div className="metric-card">
                 <span>Urban Pressure</span>
                 <strong style={{ color: '#f59e0b' }}>{metrics?.towardsCityCount}</strong>
              </div>
              <div className="metric-card">
                 <span>Total Pigs</span>
                 <strong>{metrics?.totalCount}</strong>
              </div>
              <div className="metric-card">
                 <span>Hot Station</span>
                 <span style={{ fontSize: '0.6rem', color: '#fde68a', fontWeight: 900 }}>{metrics?.topStation?.replace('Control Station ', 'CS')}</span>
              </div>
           </div>
        </section>

        {metrics?.thermalGradient && (
           <section className="panel-section">
              <div className="section-heading"><Thermometer size={16} /> <h2>Thermal Preference</h2></div>
              <div className="scenario-state">
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                    <span>NORTH (Shadow)</span>
                    <strong>{metrics.thermalGradient.north}</strong>
                 </div>
                 <div className="scenario-progress"><span style={{ background: '#3b82f6', width: `${(metrics.thermalGradient.north / (metrics.thermalGradient.north + metrics.thermalGradient.south || 1)) * 100}%` }} /></div>
                 <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', marginTop: '8px' }}>
                    <span>SOUTH (Heat)</span>
                    <strong>{metrics.thermalGradient.south}</strong>
                 </div>
                 <div className="scenario-progress"><span style={{ background: '#ef4444', width: `${(metrics.thermalGradient.south / (metrics.thermalGradient.north + metrics.thermalGradient.south || 1)) * 100}%` }} /></div>
              </div>
           </section>
        )}
      </aside>

      {/* CENTER: Interactive Map */}
      <SummaryMap stations={stations} events={events} />

      {/* RIGHT RAIL: Expert Report & Charts */}
      <aside className="right-rail" style={{ overflowY: 'auto' }}>
        <section className="panel-section">
          <div className="section-heading" style={{ color: '#f59e0b' }}><ShieldAlert size={18} /> <h2>Expert Epidemiological Report</h2></div>
          <div style={{ 
            background: 'rgba(68, 64, 60, 0.38)', 
            border: '1px solid rgba(120, 113, 108, 0.28)', 
            padding: '12px', 
            borderRadius: '8px',
            fontSize: '0.82rem',
            lineHeight: '1.5',
            color: '#d6d3d1'
          }}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{analysis}</div>
          </div>
        </section>

        {metrics?.hourlyActivity && (
          <section className="panel-section">
             <div className="section-heading"><Clock3 size={16} /> <h2>Activity by Hour</h2></div>
             <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px', paddingBottom: '10px' }}>
                {metrics.hourlyActivity.map((count: number, i: number) => {
                  const max = Math.max(...metrics.hourlyActivity);
                  const h = max > 0 ? (count / max) * 100 : 0;
                  return <div key={i} style={{ flex: 1, height: `${h}%`, background: i >= 8 && i <= 19 ? '#f59e0b' : '#3b82f6', borderRadius: '1px' }} />
                })}
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6rem', color: '#a8a29e' }}>
                <span>00:00</span>
                <span>12:00</span>
                <span>23:00</span>
             </div>
          </section>
        )}

        <section className="panel-section">
           <div className="section-heading"><MapPin size={16} /> <h2>Recent Perimeter Detections</h2></div>
           <div className="station-list" style={{ maxHeight: '200px' }}>
              {events.slice(0, 10).map(e => (
                <div key={e.eventId} className="station-card" style={{ padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ display: 'grid' }}>
                      <strong style={{ fontSize: '0.75rem' }}>{e.stationId.replace('collserola-control-', 'CS-')}</strong>
                      <span style={{ fontSize: '0.65rem', color: '#a8a29e' }}>{new Date(e.observedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                   </div>
                   <span style={{ fontSize: '0.65rem', fontWeight: 900, color: e.direction === 'towards_city' ? '#ef4444' : '#22c55e' }}>
                      {e.direction === 'towards_city' ? '→ CITY' : '↓ FOREST'}
                   </span>
                </div>
              ))}
           </div>
        </section>
      </aside>
    </main>
  );
}
