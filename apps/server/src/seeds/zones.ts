import { ZoneSchema, type Zone } from "@guaita/shared";

export const seedZones: Zone[] = ZoneSchema.array().parse([
  {
    id: "central-forest",
    name: "Central Forest",
    kind: "forest",
    severity: "low",
    description: "Baseline forest activity zone",
    polygon: [
      [2.0605, 41.3998],
      [2.1135, 41.3998],
      [2.1232, 41.4324],
      [2.0832, 41.4522],
      [2.0541, 41.4292],
      [2.0605, 41.3998]
    ]
  },
  {
    id: "urban-frontier-east",
    name: "Eastern Urban Frontier",
    kind: "frontier",
    severity: "high",
    description: "High-transit boundary near Barcelona access points",
    polygon: [
      [2.1032, 41.4028],
      [2.1542, 41.4122],
      [2.1533, 41.4488],
      [2.1197, 41.455],
      [2.0992, 41.428],
      [2.1032, 41.4028]
    ]
  },
  {
    id: "containment-west",
    name: "Western Containment Edge",
    kind: "containment",
    severity: "medium",
    description: "Containment-facing western perimeter",
    polygon: [
      [2.036, 41.414],
      [2.082, 41.418],
      [2.088, 41.455],
      [2.048, 41.463],
      [2.031, 41.438],
      [2.036, 41.414]
    ]
  }
]);
