import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Server as SocketServer } from "socket.io";
import {
  DetectionEventInputSchema,
  SOCKET_EVENTS,
  type DetectionEventInput,
  type DetectionSource
} from "@guaita/shared";
import { config } from "./config.js";
import { GuaitaDatabase } from "./db/database.js";
import { assertSource, estimateSeverity, normalizeDetectionEvent } from "./domain/detections.js";
import { ScenarioEngine } from "./scenarios/scenario-engine.js";

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
  const scenarioEngine = new ScenarioEngine({
    onDetection: (input) => {
      try {
        storeDetection(input, db, io);
      } catch (error) {
        app.log.error({ error }, "failed to store scenario detection");
      }
    },
    onStateChange: (state, eventName) => {
      io.emit(eventName, state);
      if (eventName !== SOCKET_EVENTS.scenarioUpdated) {
        io.emit(SOCKET_EVENTS.scenarioUpdated, state);
      }
    }
  });

  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ["GET", "POST", "DELETE"]
  });

  app.addHook("onClose", async () => {
    scenarioEngine.stop();
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

  app.get("/api/scenario/state", async () => ({
    scenario: scenarioEngine.getState()
  }));

  app.post("/api/scenario/start", async () => ({
    ok: true,
    scenario: scenarioEngine.start()
  }));

  app.post("/api/scenario/pause", async () => ({
    ok: true,
    scenario: scenarioEngine.pause()
  }));

  app.post("/api/scenario/resume", async () => ({
    ok: true,
    scenario: scenarioEngine.resume()
  }));

  app.post("/api/scenario/reset", async () => ({
    ok: true,
    scenario: scenarioEngine.reset()
  }));

  app.post("/api/scenario/advance", async (request, reply) => {
    const body = request.body as { ms?: unknown; minutes?: unknown } | undefined;
    const minutes = body?.minutes === undefined ? 15 : Number(body.minutes);
    const ms = body?.ms === undefined ? minutes * 60_000 : Number(body.ms);

    if (!Number.isFinite(ms) || ms < 0 || ms > 6 * 60 * 60_000) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_advance_interval"
      });
    }

    return {
      ok: true,
      scenario: scenarioEngine.advance(ms)
    };
  });

  app.post("/api/scenario/speed", async (request, reply) => {
    const body = request.body as { speedMultiplier?: unknown } | undefined;
    const speedMultiplier = Number(body?.speedMultiplier);

    try {
      return {
        ok: true,
        scenario: scenarioEngine.setSpeed(speedMultiplier)
      };
    } catch (error) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_scenario_speed",
        message: error instanceof Error ? error.message : "Invalid scenario speed."
      });
    }
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

  try {
    const { event, severity } = storeDetection(parsed.data, db, io);

    return reply.code(201).send({
      ok: true,
      eventId: event.eventId,
      severity,
      event
    });
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return reply.code(409).send({
        ok: false,
        error: "duplicate_event"
      });
    }

    if (error instanceof Error && error.message.startsWith("unknown_station:")) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId: error.message.replace("unknown_station:", "")
      });
    }

    throw error;
  }
}

function storeDetection(input: DetectionEventInput, db: GuaitaDatabase, io: SocketServer) {
  const event = normalizeDetectionEvent(input);
  const station = db.getStation(event.stationId);

  if (!station) {
    throw new Error(`unknown_station:${event.stationId}`);
  }

  db.insertEvent(event);
  const severity = estimateSeverity(event, station);
  io.emit(SOCKET_EVENTS.detectionCreated, event);

  return {
    event,
    severity
  };
}
