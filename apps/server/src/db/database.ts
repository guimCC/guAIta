import DatabaseConstructor from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  CivilProtectionCallSchema,
  DetectionEventSchema,
  StationSchema,
  TelemetryReadingSchema,
  ZoneSchema,
  type CivilProtectionCall,
  type DetectionEvent,
  type Station,
  type TelemetryReading,
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

  getEvent(eventId: string): DetectionEvent | undefined {
    const row = this.sqlite
      .prepare("select payload from events where event_id = ?")
      .get(eventId) as JsonRow | undefined;

    return row ? DetectionEventSchema.parse(JSON.parse(row.payload)) : undefined;
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

  clearEvents(): number {
    this.clearCalls();
    const result = this.sqlite.prepare("delete from events").run();
    return result.changes;
  }

  insertTelemetryReading(reading: TelemetryReading): void {
    this.sqlite
      .prepare(
        `insert into telemetry_readings (telemetry_id, station_id, observed_at, source, payload, created_at)
         values (@telemetryId, @stationId, @observedAt, @source, @payload, @createdAt)`
      )
      .run({
        telemetryId: reading.telemetryId,
        stationId: reading.stationId,
        observedAt: reading.observedAt,
        source: reading.source,
        payload: JSON.stringify(reading),
        createdAt: new Date().toISOString()
      });
  }

  listTelemetryReadings(limit = 100): TelemetryReading[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.sqlite
      .prepare("select payload from telemetry_readings order by observed_at desc, created_at desc limit ?")
      .all(boundedLimit) as JsonRow[];

    return rows.map((row) => TelemetryReadingSchema.parse(JSON.parse(row.payload)));
  }

  listLatestTelemetryReadings(): TelemetryReading[] {
    const latestByStation = new Map<string, TelemetryReading>();

    for (const reading of this.listTelemetryReadings(500)) {
      if (!latestByStation.has(reading.stationId)) {
        latestByStation.set(reading.stationId, reading);
      }
    }

    return Array.from(latestByStation.values());
  }

  clearCalls(): number {
    const result = this.sqlite.prepare("delete from calls").run();
    return result.changes;
  }

  insertCall(call: CivilProtectionCall): void {
    this.sqlite
      .prepare(
        `insert into calls (id, event_id, status, provider, conversation_id, call_sid, payload, created_at, updated_at)
         values (@id, @eventId, @status, @provider, @conversationId, @callSid, @payload, @createdAt, @updatedAt)`
      )
      .run({
        id: call.id,
        eventId: call.eventId,
        status: call.status,
        provider: call.provider,
        conversationId: call.conversationId ?? null,
        callSid: call.callSid ?? null,
        payload: JSON.stringify(call),
        createdAt: call.createdAt,
        updatedAt: call.updatedAt
      });
  }

  updateCall(call: CivilProtectionCall): void {
    this.sqlite
      .prepare(
        `update calls
         set status = @status,
             conversation_id = @conversationId,
             call_sid = @callSid,
             payload = @payload,
             updated_at = @updatedAt
         where id = @id`
      )
      .run({
        id: call.id,
        status: call.status,
        conversationId: call.conversationId ?? null,
        callSid: call.callSid ?? null,
        payload: JSON.stringify(call),
        updatedAt: call.updatedAt
      });
  }

  getCall(callId: string): CivilProtectionCall | undefined {
    const row = this.sqlite
      .prepare("select payload from calls where id = ?")
      .get(callId) as JsonRow | undefined;

    return row ? CivilProtectionCallSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  getLatestCallForEvent(eventId: string): CivilProtectionCall | undefined {
    const row = this.sqlite
      .prepare("select payload from calls where event_id = ? order by created_at desc limit 1")
      .get(eventId) as JsonRow | undefined;

    return row ? CivilProtectionCallSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  getCallByConversationId(conversationId: string): CivilProtectionCall | undefined {
    const row = this.sqlite
      .prepare("select payload from calls where conversation_id = ? order by created_at desc limit 1")
      .get(conversationId) as JsonRow | undefined;

    return row ? CivilProtectionCallSchema.parse(JSON.parse(row.payload)) : undefined;
  }

  listCalls(limit = 100): CivilProtectionCall[] {
    const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
    const rows = this.sqlite
      .prepare("select payload from calls order by created_at desc limit ?")
      .all(boundedLimit) as JsonRow[];

    return rows.map((row) => CivilProtectionCallSchema.parse(JSON.parse(row.payload)));
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

      create table if not exists calls (
        id text primary key,
        event_id text not null,
        status text not null,
        provider text not null,
        conversation_id text,
        call_sid text,
        payload text not null,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists telemetry_readings (
        telemetry_id text primary key,
        station_id text not null,
        observed_at text not null,
        source text not null,
        payload text not null,
        created_at text not null
      );

      create index if not exists events_observed_at_idx on events(observed_at desc);
      create index if not exists events_station_id_idx on events(station_id);
      create index if not exists calls_event_id_idx on calls(event_id);
      create index if not exists calls_conversation_id_idx on calls(conversation_id);
      create index if not exists calls_created_at_idx on calls(created_at desc);
      create index if not exists telemetry_observed_at_idx on telemetry_readings(observed_at desc);
      create index if not exists telemetry_station_id_idx on telemetry_readings(station_id);
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
      this.sqlite.prepare("delete from stations").run();
      this.sqlite.prepare("delete from zones").run();

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
