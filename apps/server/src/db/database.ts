import DatabaseConstructor from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  DetectionEventSchema,
  StationSchema,
  ZoneSchema,
  type DetectionEvent,
  type Station,
  type Zone
} from "@guaita/shared";
import { seedStations } from "../seeds/stations.js";
import { seedZones } from "../seeds/zones.js";

type Database = InstanceType<typeof DatabaseConstructor>;

interface JsonRow {
  payload: string;
}

export class GuaitaDatabase {
  private readonly sqlite: Database;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.sqlite = new DatabaseConstructor(databasePath);
    this.sqlite.pragma("journal_mode = WAL");
    this.initialize();
    this.seedStaticData();
  }

  close(): void {
    this.sqlite.close();
  }

  listStations(): Station[] {
    const rows = this.sqlite
      .prepare("select payload from stations order by id asc")
      .all() as JsonRow[];

    return rows.map((row) => StationSchema.parse(JSON.parse(row.payload)));
  }

  getStation(stationId: string): Station | undefined {
    const row = this.sqlite
      .prepare("select payload from stations where id = ?")
      .get(stationId) as JsonRow | undefined;

    return row ? StationSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  listZones(): Zone[] {
    const rows = this.sqlite
      .prepare("select payload from zones order by id asc")
      .all() as JsonRow[];

    return rows.map((row) => ZoneSchema.parse(JSON.parse(row.payload)));
  }

  insertEvent(event: DetectionEvent): void {
    this.sqlite
      .prepare(
        `insert into events (event_id, station_id, observed_at, source, payload, created_at)
         values (@eventId, @stationId, @observedAt, @source, @payload, @createdAt)`
      )
      .run({
        eventId: event.eventId,
        stationId: event.stationId,
        observedAt: event.observedAt,
        source: event.source,
        payload: JSON.stringify(event),
        createdAt: new Date().toISOString()
      });
  }

  listEvents(limit = 100): DetectionEvent[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.sqlite
      .prepare("select payload from events order by observed_at desc, created_at desc limit ?")
      .all(boundedLimit) as JsonRow[];

    return rows.map((row) => DetectionEventSchema.parse(JSON.parse(row.payload)));
  }

  private initialize(): void {
    this.sqlite.exec(`
      create table if not exists stations (
        id text primary key,
        payload text not null
      );

      create table if not exists zones (
        id text primary key,
        payload text not null
      );

      create table if not exists events (
        event_id text primary key,
        station_id text not null,
        observed_at text not null,
        source text not null,
        payload text not null,
        created_at text not null
      );

      create index if not exists events_observed_at_idx on events(observed_at desc);
      create index if not exists events_station_id_idx on events(station_id);
    `);
  }

  private seedStaticData(): void {
    const insertStation = this.sqlite.prepare(
      `insert into stations (id, payload)
       values (@id, @payload)
       on conflict(id) do update set payload = excluded.payload`
    );
    const insertZone = this.sqlite.prepare(
      `insert into zones (id, payload)
       values (@id, @payload)
       on conflict(id) do update set payload = excluded.payload`
    );

    const seed = this.sqlite.transaction(() => {
      for (const station of seedStations) {
        insertStation.run({ id: station.id, payload: JSON.stringify(station) });
      }

      for (const zone of seedZones) {
        insertZone.run({ id: zone.id, payload: JSON.stringify(zone) });
      }
    });

    seed();
  }
}
