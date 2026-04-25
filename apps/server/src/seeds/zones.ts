import { ZoneSchema, type Zone } from "@guaita/shared";
import { collserolaContainmentPolygon } from "./collserola-map.js";

export const seedZones: Zone[] = ZoneSchema.array().parse([
  {
    id: "collserola-containment-area",
    name: "Collserola Containment Area",
    kind: "containment",
    severity: "medium",
    description: "Operator-provided containment boundary from the demo GeoJSON map",
    polygon: collserolaContainmentPolygon
  }
]);
