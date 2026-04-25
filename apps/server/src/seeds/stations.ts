import { StationSchema, type Station } from "@guaita/shared";
import { collserolaControlPoints } from "./collserola-map.js";

const seededAt = "2026-04-25T08:30:00.000Z";
const containmentZoneId = "collserola-containment-area";

const namedStations: Record<number, Pick<Station, "id" | "name" | "description">> = {
  1: {
    id: "containment-west-01",
    name: "Control Station 01",
    description: "Western containment control station"
  },
  18: {
    id: "forest-control-01",
    name: "Control Station 18",
    description: "Interior forest control station"
  },
  42: {
    id: "live-device-01",
    name: "Control Station 42 / UNO Q",
    description: "Physical Arduino UNO Q demo control station"
  },
  49: {
    id: "frontier-gate-01",
    name: "Control Station 49",
    description: "Boundary access control station"
  },
  57: {
    id: "urban-edge-01",
    name: "Control Station 57",
    description: "Urban edge control station"
  }
};

export const seedStations: Station[] = StationSchema.array().parse(
  collserolaControlPoints.map(([longitude, latitude], index): Station => {
    const stationNumber = index + 1;
    const namedStation = namedStations[stationNumber];

    return {
      id: namedStation?.id ?? `collserola-control-${stationNumber.toString().padStart(2, "0")}`,
      name: namedStation?.name ?? `Control Station ${stationNumber.toString().padStart(2, "0")}`,
      type: "control",
      status: stationNumber % 17 === 0 ? "degraded" : "online",
      latitude,
      longitude,
      zoneId: containmentZoneId,
      batteryPct: stationNumber === 42 ? 100 : Math.max(61, 98 - (stationNumber % 14) * 3),
      lastSeenAt: seededAt,
      description: namedStation?.description ?? "Operator-provided control station from the demo GeoJSON map"
    };
  })
);
