import { StationSchema, type Station } from "@guaita/shared";

const seededAt = "2026-04-25T08:30:00.000Z";

export const seedStations: Station[] = StationSchema.array().parse([
  {
    id: "forest-control-01",
    name: "Vallvidrera Ridge",
    type: "control",
    status: "online",
    latitude: 41.4217,
    longitude: 2.0912,
    zoneId: "central-forest",
    batteryPct: 96,
    lastSeenAt: seededAt,
    description: "Interior forest control point"
  },
  {
    id: "frontier-gate-01",
    name: "Carretera de les Aigues Access",
    type: "frontier",
    status: "online",
    latitude: 41.4149,
    longitude: 2.1216,
    zoneId: "urban-frontier-east",
    batteryPct: 88,
    lastSeenAt: seededAt,
    description: "High-transit access point near the city edge"
  },
  {
    id: "containment-west-01",
    name: "Sant Cugat Frontier",
    type: "containment",
    status: "online",
    latitude: 41.4392,
    longitude: 2.077,
    zoneId: "containment-west",
    batteryPct: 91,
    lastSeenAt: seededAt,
    description: "Containment-facing western station"
  },
  {
    id: "urban-edge-01",
    name: "Horta Access",
    type: "urban",
    status: "degraded",
    latitude: 41.438,
    longitude: 2.145,
    zoneId: "urban-frontier-east",
    batteryPct: 63,
    lastSeenAt: seededAt,
    description: "Urban-adjacent station with reduced battery"
  },
  {
    id: "live-device-01",
    name: "UNO Q Demo Station",
    type: "frontier",
    status: "online",
    latitude: 41.4251,
    longitude: 2.1058,
    zoneId: "urban-frontier-east",
    batteryPct: 100,
    lastSeenAt: seededAt,
    description: "Physical Arduino UNO Q demo device"
  }
]);
