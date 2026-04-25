import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Server as SocketServer } from "socket.io";
import { DetectionEventInputSchema, SOCKET_EVENTS, type DetectionSource } from "@guaita/shared";
import { config } from "./config.js";
import { GuaitaDatabase } from "./db/database.js";
import { assertSource, estimateSeverity, normalizeDetectionEvent } from "./domain/detections.js";

function isDuplicateEventError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

export async function buildServer() {
  const db = new GuaitaDatabase(config.databasePath);
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info"
    }
  });
  const io = new SocketServer(app.server, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST", "DELETE"]
    }
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "DELETE"]
  });

  app.addHook("onClose", async () => {
    io.close();
    db.close();
  });

  app.get("/health", async () => ({
    ok: true,
    service: "guaita-server",
    time: new Date().toISOString()
  }));

  app.get("/api/stations", async () => ({
    stations: db.listStations()
  }));

  app.get("/api/zones", async () => ({
    zones: db.listZones()
  }));

  app.get("/api/events", async (request: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;
    return {
      events: db.listEvents(Number.isFinite(limit) ? limit : 100)
    };
  });

  app.delete("/api/events", async () => {
    const deletedCount = db.clearEvents();
    io.emit(SOCKET_EVENTS.eventsCleared, {
      deletedCount,
      clearedAt: new Date().toISOString()
    });

    return {
      ok: true,
      deletedCount
    };
  });

  app.post("/api/device/events", async (request, reply) => {
    const authorization = request.headers.authorization;

    if (authorization !== `Bearer ${config.deviceToken}`) {
      return reply.code(401).send({
        ok: false,
        error: "unauthorized"
      });
    }

    return createDetection(request, reply, "device", db, io);
  });

  app.post("/api/manual/events", async (request, reply) => {
    return createDetection(request, reply, "manual", db, io);
  });

  return { app, db, io };
}

async function createDetection(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedSource: DetectionSource,
  db: GuaitaDatabase,
  io: SocketServer
) {
  const parsed = DetectionEventInputSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid_detection_event",
      issues: parsed.error.flatten()
    });
  }

  try {
    assertSource(parsed.data, expectedSource);
  } catch (error) {
    return reply.code(400).send({
      ok: false,
      error: "invalid_event_source",
      message: error instanceof Error ? error.message : "Invalid event source."
    });
  }

  const event = normalizeDetectionEvent(parsed.data);
  const station = db.getStation(event.stationId);

  if (!station) {
    return reply.code(404).send({
      ok: false,
      error: "unknown_station",
      stationId: event.stationId
    });
  }

  try {
    db.insertEvent(event);
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return reply.code(409).send({
        ok: false,
        error: "duplicate_event",
        eventId: event.eventId
      });
    }

    throw error;
  }

  const severity = estimateSeverity(event, station);
  io.emit(SOCKET_EVENTS.detectionCreated, event);

  return reply.code(201).send({
    ok: true,
    eventId: event.eventId,
    severity,
    event
  });
}
