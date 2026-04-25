import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Server as SocketServer } from "socket.io";
import {
  AcknowledgeCivilProtectionCallInputSchema,
  StartCivilProtectionCallInputSchema,
  DetectionEventInputSchema,
  LiveStreamFrameInputSchema,
  SOCKET_EVENTS,
  TelemetryReadingInputSchema,
  type AcknowledgeCivilProtectionCallInput,
  type CallStatus,
  type CivilProtectionCall,
  type DetectionEvent,
  type DetectionEventInput,
  type DetectionSnapshotInput,
  type DetectionSource,
  type LiveStreamFrame,
  type LiveStreamFrameInput,
  type LiveStreamSession,
  type Station,
  type TelemetryReading,
  type TelemetryReadingInput
} from "@guaita/shared";
import { config } from "./config.js";
import { GuaitaDatabase, type RuntimeResetResult } from "./db/database.js";
import {
  createCivilProtectionCallRecord,
  placeElevenLabsOutboundCall
} from "./domain/civil-protection-calls.js";
import { assertSource, estimateSeverity, normalizeDetectionEvent } from "./domain/detections.js";
import { hasTelemetryValues, normalizeTelemetryReading } from "./domain/telemetry.js";
import { ScenarioEngine } from "./scenarios/scenario-engine.js";

function isDuplicateEventError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

const MAX_SNAPSHOT_BYTES = 1_000_000;
const MAX_STREAM_FRAME_BYTES = 750_000;
const LIVE_STREAM_TARGET_FPS = 2;
const LIVE_STREAM_FRAME_INTERVAL_MS = Math.round(1000 / LIVE_STREAM_TARGET_FPS);
const LIVE_STREAM_SESSION_TTL_MS = 60_000;
const ACTIVE_ESCALATION_CALL_STATUSES = new Set<CallStatus>(["requested", "calling", "completed"]);
const REUSABLE_CALL_STATUSES = new Set<CallStatus>(["requested", "calling", "completed", "acknowledged"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface StoredSnapshot {
  imageBuffer: Buffer;
  extension: "jpg" | "png";
  contentType: "image/jpeg" | "image/png";
}

interface StoredSnapshotFile {
  path: string;
  contentType: StoredSnapshot["contentType"];
}

interface DeviceListenerState {
  enabled: boolean;
  updatedAt: string;
  reason: string;
  expiresAt?: string;
}

interface DecodedLiveStreamFrame {
  imageBuffer: Buffer;
}

interface LiveStreamFrameMetadata {
  stationId: string;
  capturedAt?: string;
  boundingBoxesEnabled?: boolean;
  frameWidth?: number;
  frameHeight?: number;
  boxes?: LiveStreamFrame["boxes"];
}

interface LiveStreamFramePacket extends LiveStreamFrame {
  imageBytes: Buffer;
}

class SnapshotValidationError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

class LiveStreamFrameValidationError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export async function buildServer() {
  const db = new GuaitaDatabase(config.databasePath);
  const app = Fastify({
    bodyLimit: 2_000_000,
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info"
    }
  });
  const io = new SocketServer(app.server, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST", "PUT", "DELETE"]
    }
  });
  let deviceListenerState = createDeviceListenerState(false, "server.start");
  let deviceListenerTimer: ReturnType<typeof setTimeout> | undefined;
  const liveStreamSessions = new Map<string, LiveStreamSession>();
  const liveStreamExpiryTimer = setInterval(() => {
    expireLiveStreamSessions();
  }, 2_000);

  if (config.demoResetOnStart) {
    const reset = db.resetRuntimeData();
    app.log.info({ reset }, "reset demo runtime state on startup");
  }

  function setDeviceListenerEnabled(enabled: boolean, reason: string): DeviceListenerState {
    if (deviceListenerTimer) {
      clearTimeout(deviceListenerTimer);
      deviceListenerTimer = undefined;
    }

    const expiresAt = enabled && config.deviceEventsArmTtlMs > 0
      ? new Date(Date.now() + config.deviceEventsArmTtlMs).toISOString()
      : undefined;
    deviceListenerState = createDeviceListenerState(enabled, reason, expiresAt);

    if (enabled && config.deviceEventsArmTtlMs > 0) {
      deviceListenerTimer = setTimeout(() => {
        setDeviceListenerEnabled(false, "device.listener.timeout");
      }, config.deviceEventsArmTtlMs);
    }

    io.emit(SOCKET_EVENTS.deviceListenerUpdated, deviceListenerState);
    return deviceListenerState;
  }

  function emitRuntimeReset(reset: RuntimeResetResult): void {
    const clearedAt = new Date().toISOString();

    io.emit(SOCKET_EVENTS.eventsCleared, {
      deletedCount: reset.eventsDeleted,
      clearedAt
    });
    io.emit(SOCKET_EVENTS.callsCleared, {
      deletedCount: reset.callsDeleted,
      clearedAt
    });
    io.emit(SOCKET_EVENTS.telemetryCleared, {
      deletedCount: reset.telemetryReadingsDeleted,
      clearedAt
    });
  }

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
    methods: ["GET", "POST", "PUT", "DELETE"]
  });

  app.addContentTypeParser("image/jpeg", { parseAs: "buffer" }, (_request, body, done) => {
    done(null, body);
  });

  setDeviceListenerEnabled(config.deviceEventsEnabledOnStart, "server.start");

  app.addHook("onClose", async () => {
    if (deviceListenerTimer) {
      clearTimeout(deviceListenerTimer);
    }
    clearInterval(liveStreamExpiryTimer);
    scenarioEngine.stop();
    io.close();
    db.close();
  });

  function inactiveLiveStreamSession(stationId: string): LiveStreamSession {
    return {
      stationId,
      active: false,
      targetFps: LIVE_STREAM_TARGET_FPS,
      frameIntervalMs: LIVE_STREAM_FRAME_INTERVAL_MS,
      updatedAt: new Date().toISOString()
    };
  }

  function getLiveStreamSession(stationId: string): LiveStreamSession {
    expireLiveStreamSessions();
    return liveStreamSessions.get(stationId) ?? inactiveLiveStreamSession(stationId);
  }

  function startLiveStreamSession(stationId: string): LiveStreamSession {
    const now = new Date();
    const session: LiveStreamSession = {
      ...liveStreamSessions.get(stationId),
      stationId,
      active: true,
      targetFps: LIVE_STREAM_TARGET_FPS,
      frameIntervalMs: LIVE_STREAM_FRAME_INTERVAL_MS,
      requestedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + LIVE_STREAM_SESSION_TTL_MS).toISOString()
    };

    liveStreamSessions.set(stationId, session);
    io.emit(SOCKET_EVENTS.streamSessionUpdated, session);
    return session;
  }

  function stopLiveStreamSession(stationId: string): LiveStreamSession {
    const existing = liveStreamSessions.get(stationId);
    const session: LiveStreamSession = {
      ...(existing ?? inactiveLiveStreamSession(stationId)),
      stationId,
      active: false,
      targetFps: LIVE_STREAM_TARGET_FPS,
      frameIntervalMs: LIVE_STREAM_FRAME_INTERVAL_MS,
      updatedAt: new Date().toISOString()
    };
    delete session.expiresAt;

    liveStreamSessions.set(stationId, session);
    io.emit(SOCKET_EVENTS.streamSessionUpdated, session);
    return session;
  }

  function stopAllLiveStreamSessions(): void {
    for (const stationId of liveStreamSessions.keys()) {
      stopLiveStreamSession(stationId);
    }
  }

  function expireLiveStreamSessions(): void {
    const nowMs = Date.now();

    for (const [stationId, session] of liveStreamSessions) {
      if (!session.active || !session.expiresAt || new Date(session.expiresAt).getTime() > nowMs) {
        continue;
      }

      const expiredSession: LiveStreamSession = {
        ...session,
        active: false,
        updatedAt: new Date().toISOString()
      };
      delete expiredSession.expiresAt;
      liveStreamSessions.set(stationId, expiredSession);
      io.emit(SOCKET_EVENTS.streamSessionUpdated, expiredSession);
    }
  }

  function updateLiveStreamSessionAfterFrame(frame: LiveStreamFrame): LiveStreamSession {
    const existing = liveStreamSessions.get(frame.stationId) ?? inactiveLiveStreamSession(frame.stationId);
    const session: LiveStreamSession = {
      ...existing,
      updatedAt: frame.receivedAt,
      lastFrameAt: frame.receivedAt,
      lastFrameId: frame.frameId,
      lastBoundingBoxesEnabled: frame.boundingBoxesEnabled
    };

    liveStreamSessions.set(frame.stationId, session);
    io.emit(SOCKET_EVENTS.streamSessionUpdated, session);
    return session;
  }

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

  app.get("/api/events/:eventId/snapshot", async (request: FastifyRequest<{ Params: { eventId: string } }>, reply) => {
    const event = db.getEvent(request.params.eventId);

    if (!event || !event.imageUrl) {
      return reply.code(404).send({
        ok: false,
        error: "snapshot_not_found"
      });
    }

    const storedSnapshot = findSnapshotFile(event.eventId);
    if (!storedSnapshot) {
      return reply.code(404).send({
        ok: false,
        error: "snapshot_not_found"
      });
    }

    return reply
      .header("Cache-Control", "no-store")
      .type(storedSnapshot.contentType)
      .send(createReadStream(storedSnapshot.path));
  });

  app.get("/api/telemetry", async (request: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;
    return {
      telemetry: db.listTelemetryReadings(Number.isFinite(limit) ? limit : 100)
    };
  });

  app.get("/api/telemetry/latest", async () => ({
    telemetry: db.listLatestTelemetryReadings()
  }));

  app.get("/api/streams/:stationId", async (request: FastifyRequest<{ Params: { stationId: string } }>, reply) => {
    if (!db.getStation(request.params.stationId)) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId: request.params.stationId
      });
    }

    return {
      ok: true,
      stream: getLiveStreamSession(request.params.stationId)
    };
  });

  app.post("/api/streams/:stationId/start", async (request: FastifyRequest<{ Params: { stationId: string } }>, reply) => {
    if (!db.getStation(request.params.stationId)) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId: request.params.stationId
      });
    }

    return {
      ok: true,
      stream: startLiveStreamSession(request.params.stationId)
    };
  });

  app.post("/api/streams/:stationId/stop", async (request: FastifyRequest<{ Params: { stationId: string } }>, reply) => {
    if (!db.getStation(request.params.stationId)) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId: request.params.stationId
      });
    }

    return {
      ok: true,
      stream: stopLiveStreamSession(request.params.stationId)
    };
  });

  app.get("/api/device/listening", async () => ({
    deviceListening: deviceListenerState
  }));

  app.get("/api/device/stream-state", async (request: FastifyRequest<{ Querystring: { stationId?: string } }>, reply) => {
    const authorization = request.headers.authorization;

    if (authorization !== `Bearer ${config.deviceToken}`) {
      return reply.code(401).send({
        ok: false,
        error: "unauthorized"
      });
    }

    const stationId = request.query.stationId?.trim();
    if (!stationId) {
      return reply.code(400).send({
        ok: false,
        error: "missing_station_id"
      });
    }

    if (!db.getStation(stationId)) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId
      });
    }

    return {
      ok: true,
      stream: getLiveStreamSession(stationId)
    };
  });

  app.put("/api/device/listening", async (request, reply) => {
    const body = request.body as { enabled?: unknown } | undefined;

    if (typeof body?.enabled !== "boolean") {
      return reply.code(400).send({
        ok: false,
        error: "invalid_device_listener_state",
        message: "Request body must include boolean field `enabled`."
      });
    }

    return {
      ok: true,
      deviceListening: setDeviceListenerEnabled(body.enabled, body.enabled ? "dashboard.armed" : "dashboard.disarmed")
    };
  });

  app.post("/api/demo/reset", async () => {
    const reset = db.resetRuntimeData();
    emitRuntimeReset(reset);
    stopAllLiveStreamSessions();
    const scenario = scenarioEngine.reset();

    return {
      ok: true,
      reset,
      scenario,
      deviceListening: setDeviceListenerEnabled(false, "demo.reset")
    };
  });

  app.delete("/api/events", async () => {
    const deletedCount = db.clearEvents();
    clearEventImageFiles();
    io.emit(SOCKET_EVENTS.eventsCleared, {
      deletedCount,
      clearedAt: new Date().toISOString()
    });
    io.emit(SOCKET_EVENTS.callsCleared, {
      clearedAt: new Date().toISOString()
    });

    return {
      ok: true,
      deletedCount
    };
  });

  app.get("/api/calls", async (request: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;

    return {
      calls: db.listCalls(Number.isFinite(limit) ? limit : 100)
    };
  });

  app.delete("/api/calls", async () => {
    const deletedCount = db.clearCalls();
    io.emit(SOCKET_EVENTS.callsCleared, {
      deletedCount,
      clearedAt: new Date().toISOString()
    });

    return {
      ok: true,
      deletedCount
    };
  });

  app.post("/api/calls/civil-protection", async (request, reply) => {
    const parsed = StartCivilProtectionCallInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_call_request",
        issues: parsed.error.flatten()
      });
    }

    const event = db.getEvent(parsed.data.eventId);
    if (!event) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_event",
        eventId: parsed.data.eventId
      });
    }

    const station = db.getStation(event.stationId);
    if (!station) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId: event.stationId
      });
    }

    const toNumber = parsed.data.toNumber ?? config.civilProtectionDemoNumber;
    if (!toNumber) {
      return reply.code(400).send({
        ok: false,
        error: "missing_demo_recipient",
        message: "Set CIVIL_PROTECTION_DEMO_NUMBER or pass toNumber in the request."
      });
    }

    const callResult = await startCivilProtectionCall({
      event,
      station,
      toNumber,
      db,
      io
    });

    if (callResult.failed) {
      return reply.code(502).send({
        ok: false,
        error: "outbound_call_failed",
        message: callResult.call.error,
        call: callResult.call
      });
    }

    if (!config.callsEnabled && !callResult.reused) {
      return reply.code(202).send({
        ok: true,
        call: callResult.call,
        message: "Call record stored. Set CALLS_ENABLED=true and ElevenLabs credentials to place the real outbound call."
      });
    }

    return reply.code(callResult.reused ? 200 : 201).send({
      ok: true,
      call: callResult.call,
      message: callResult.message
    });
  });

  app.post(
    "/api/calls/civil-protection/acknowledge",
    async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply) => {
      if (!isAuthorizedCallWebhook(request)) {
        return reply.code(401).send({
          ok: false,
          error: "unauthorized"
        });
      }

      const parsed = AcknowledgeCivilProtectionCallInputSchema.safeParse(normalizeAcknowledgementBody(request.body));

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_acknowledgement",
          issues: parsed.error.flatten()
        });
      }

      const updatedCall = acknowledgeCall(db, io, parsed.data);
      if (!updatedCall) {
        return reply.code(404).send({
          ok: false,
          error: "unknown_call"
        });
      }

      return {
        ok: true,
        call: updatedCall
      };
    }
  );

  app.post("/api/calls/civil-protection/dashboard-acknowledge", async (request, reply) => {
    const parsed = AcknowledgeCivilProtectionCallInputSchema.safeParse(normalizeAcknowledgementBody(request.body));

    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_acknowledgement",
        issues: parsed.error.flatten()
      });
    }

    const updatedCall = acknowledgeCall(db, io, {
      ...parsed.data,
      notes: parsed.data.notes ?? "Dashboard operator marked Civil Protection response as handled."
    });

    if (!updatedCall) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_call"
      });
    }

    return {
      ok: true,
      call: updatedCall
    };
  });

  app.post(
    "/api/calls/elevenlabs/post-call",
    async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply) => {
      if (!isAuthorizedCallWebhook(request)) {
        return reply.code(401).send({
          ok: false,
          error: "unauthorized"
        });
      }

      const webhookBody = request.body as Record<string, unknown> | undefined;
      const extracted = extractPostCallData(webhookBody);
      const call = findCall(db, extracted.callId, extracted.eventId) ??
        (extracted.conversationId ? db.getCallByConversationId(extracted.conversationId) : undefined);

      if (!call) {
        request.log.warn({ extracted }, "ignored ElevenLabs post-call webhook for unknown call");
        return {
          ok: true,
          ignored: true
        };
      }

      const completedAt = new Date().toISOString();
      const status = call.status === "acknowledged" ? "acknowledged" : extracted.failed ? "failed" : "completed";
      const updatedCall: CivilProtectionCall = {
        ...call,
        status,
        conversationId: extracted.conversationId ?? call.conversationId,
        transcriptSummary: extracted.transcriptSummary ?? call.transcriptSummary,
        transcript: extracted.transcript ?? call.transcript,
        error: extracted.error ?? call.error,
        completedAt,
        failedAt: status === "failed" ? completedAt : call.failedAt,
        updatedAt: completedAt
      };

      db.updateCall(updatedCall);
      emitCallUpdated(io, updatedCall);

      return {
        ok: true,
        call: updatedCall
      };
    }
  );

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
    scenario: scenarioEngine.reset(),
    deviceListening: setDeviceListenerEnabled(false, "scenario.reset")
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

    if (!deviceListenerState.enabled) {
      return reply.code(202).send({
        ok: true,
        ignored: true,
        reason: "device_listener_disabled"
      });
    }

    if (hasActiveDeviceEscalation(db)) {
      if (scenarioEngine.getState().status === "running") {
        scenarioEngine.pause();
      }

      return reply.code(202).send({
        ok: true,
        ignored: true,
        reason: "device_escalation_in_progress"
      });
    }

    return createDetection(request, reply, "device", db, io, () => {
      setDeviceListenerEnabled(false, "device.event.accepted");
      pauseScenarioIfRunning(scenarioEngine);
      return undefined;
    });
  });

  app.post("/api/device/telemetry", async (request, reply) => {
    const authorization = request.headers.authorization;

    if (authorization !== `Bearer ${config.deviceToken}`) {
      return reply.code(401).send({
        ok: false,
        error: "unauthorized"
      });
    }

    return createTelemetryReading(request, reply, "device", db, io);
  });

  app.post("/api/device/stream-frames", async (request, reply) => {
    const authorization = request.headers.authorization;

    if (authorization !== `Bearer ${config.deviceToken}`) {
      return reply.code(401).send({
        ok: false,
        error: "unauthorized"
      });
    }

    const parsed = LiveStreamFrameInputSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: "invalid_stream_frame",
        issues: parsed.error.flatten()
      });
    }

    const station = db.getStation(parsed.data.stationId);
    if (!station) {
      return reply.code(404).send({
        ok: false,
        error: "unknown_station",
        stationId: parsed.data.stationId
      });
    }

    const session = getLiveStreamSession(parsed.data.stationId);
    if (!session.active) {
      return reply.code(202).send({
        ok: true,
        ignored: true,
        reason: "stream_inactive",
        stream: session
      });
    }

    try {
      const frame = createLiveStreamFrameFromJsonInput(parsed.data);
      updateLiveStreamSessionAfterFrame(frame);
      io.emit(SOCKET_EVENTS.streamFrame, frame);

      return reply.code(201).send({
        ok: true,
        frameId: frame.frameId,
        stream: getLiveStreamSession(frame.stationId)
      });
    } catch (error) {
      if (error instanceof LiveStreamFrameValidationError) {
        return reply.code(error.statusCode).send({
          ok: false,
          error: error.code,
          message: error.message
        });
      }

      throw error;
    }
  });

  app.post(
    "/api/device/stream-frames/raw",
    async (
      request: FastifyRequest<{
        Querystring: {
          stationId?: string;
          capturedAt?: string;
          boundingBoxesEnabled?: string;
          frameWidth?: string;
          frameHeight?: string;
        };
      }>,
      reply
    ) => {
      const authorization = request.headers.authorization;

      if (authorization !== `Bearer ${config.deviceToken}`) {
        return reply.code(401).send({
          ok: false,
          error: "unauthorized"
        });
      }

      const stationId = request.query.stationId?.trim();
      if (!stationId) {
        return reply.code(400).send({
          ok: false,
          error: "missing_station_id"
        });
      }

      const station = db.getStation(stationId);
      if (!station) {
        return reply.code(404).send({
          ok: false,
          error: "unknown_station",
          stationId
        });
      }

      const session = getLiveStreamSession(stationId);
      if (!session.active) {
        return reply.code(202).send({
          ok: true,
          ignored: true,
          reason: "stream_inactive",
          stream: session
        });
      }

      try {
        const imageBuffer = request.body instanceof Buffer ? request.body : Buffer.from([]);
        const frame = createLiveStreamFrameFromBuffer(
          {
            stationId,
            capturedAt: normalizeOptionalIsoDate(request.query.capturedAt),
            boundingBoxesEnabled: readBooleanString(request.query.boundingBoxesEnabled),
            frameWidth: readPositiveIntegerString(request.query.frameWidth),
            frameHeight: readPositiveIntegerString(request.query.frameHeight),
            boxes: parseLiveStreamBoxesHeader(request.headers["x-guaita-boxes"])
          },
          imageBuffer
        );
        const packet: LiveStreamFramePacket = {
          ...frame,
          imageBytes: imageBuffer
        };
        updateLiveStreamSessionAfterFrame(packet);
        io.emit(SOCKET_EVENTS.streamFrame, packet);

        return reply.code(201).send({
          ok: true,
          frameId: packet.frameId,
          stream: getLiveStreamSession(packet.stationId)
        });
      } catch (error) {
        if (error instanceof LiveStreamFrameValidationError) {
          return reply.code(error.statusCode).send({
            ok: false,
            error: error.code,
            message: error.message
          });
        }

        throw error;
      }
    }
  );

  app.post("/api/manual/events", async (request, reply) => {
    return createDetection(request, reply, "manual", db, io, () => {
      pauseScenarioIfRunning(scenarioEngine);
      return undefined;
    });
  });

  return { app, db, io };
}

function createDeviceListenerState(enabled: boolean, reason: string, expiresAt?: string): DeviceListenerState {
  return {
    enabled,
    reason,
    updatedAt: new Date().toISOString(),
    ...(expiresAt ? { expiresAt } : {})
  };
}

async function createTelemetryReading(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedSource: DetectionSource,
  db: GuaitaDatabase,
  io: SocketServer
) {
  const parsed = TelemetryReadingInputSchema.safeParse(request.body);

  if (!parsed.success) {
    return reply.code(400).send({
      ok: false,
      error: "invalid_telemetry_reading",
      issues: parsed.error.flatten()
    });
  }

  try {
    assertSource(parsed.data, expectedSource);
  } catch (error) {
    return reply.code(400).send({
      ok: false,
      error: "invalid_telemetry_source",
      message: error instanceof Error ? error.message : "Invalid telemetry source."
    });
  }

  if (!hasTelemetryValues(parsed.data)) {
    return reply.code(202).send({
      ok: true,
      ignored: true,
      reason: "no_telemetry_values"
    });
  }

  try {
    const telemetry = storeTelemetryReading(parsed.data, db, io);

    return reply.code(201).send({
      ok: true,
      telemetryId: telemetry.telemetryId,
      telemetry
    });
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return reply.code(409).send({
        ok: false,
        error: "duplicate_telemetry_reading"
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

async function createDetection(
  request: FastifyRequest,
  reply: FastifyReply,
  expectedSource: DetectionSource,
  db: GuaitaDatabase,
  io: SocketServer,
  onStored?: (event: DetectionEvent) => Promise<Record<string, unknown> | undefined> | Record<string, unknown> | undefined
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
    const storedResult = await onStored?.(event);

    return reply.code(201).send({
      ok: true,
      eventId: event.eventId,
      severity,
      event,
      ...storedResult
    });
  } catch (error) {
    if (isDuplicateEventError(error)) {
      return reply.code(409).send({
        ok: false,
        error: "duplicate_event"
      });
    }

    if (error instanceof SnapshotValidationError) {
      return reply.code(error.statusCode).send({
        ok: false,
        error: error.code,
        message: error.message
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

function pauseScenarioIfRunning(scenarioEngine: ScenarioEngine): void {
  if (scenarioEngine.getState().status === "running") {
    scenarioEngine.pause();
  }
}

async function startCivilProtectionCall({
  event,
  station,
  toNumber,
  db,
  io
}: {
  event: DetectionEvent;
  station: Station;
  toNumber: string;
  db: GuaitaDatabase;
  io: SocketServer;
}): Promise<{ call: CivilProtectionCall; reused: boolean; failed: boolean; message?: string }> {
  const existingCall = db.getLatestCallForEvent(event.eventId);

  if (existingCall && REUSABLE_CALL_STATUSES.has(existingCall.status)) {
    return {
      call: existingCall,
      reused: true,
      failed: false,
      message: "A Civil Protection call already exists for this detection."
    };
  }

  const activeCall = findActiveCivilProtectionCall(db);
  if (activeCall) {
    return {
      call: activeCall,
      reused: true,
      failed: false,
      message: "A Civil Protection call is already active."
    };
  }

  let call = createCivilProtectionCallRecord(
    event,
    station,
    toNumber,
    config.callsEnabled ? "elevenlabs" : "demo"
  );
  db.insertCall(call);
  emitCallUpdated(io, call);

  if (!config.callsEnabled) {
    return {
      call,
      reused: false,
      failed: false
    };
  }

  try {
    const outboundCall = await placeElevenLabsOutboundCall(call, event, station);
    const providerAcceptedAt = new Date().toISOString();
    call = {
      ...call,
      status: "calling",
      conversationId: outboundCall.conversationId,
      callSid: outboundCall.callSid,
      providerAcceptedAt,
      updatedAt: providerAcceptedAt
    };
    db.updateCall(call);
    emitCallUpdated(io, call);

    return {
      call,
      reused: false,
      failed: false
    };
  } catch (error) {
    const failedAt = new Date().toISOString();
    call = {
      ...call,
      status: "failed",
      error: error instanceof Error ? error.message : "Outbound call failed.",
      failedAt,
      updatedAt: failedAt
    };
    db.updateCall(call);
    emitCallUpdated(io, call);

    return {
      call,
      reused: false,
      failed: true
    };
  }
}

function findActiveCivilProtectionCall(db: GuaitaDatabase): CivilProtectionCall | undefined {
  return latestCallsByEvent(db).find((call) => ACTIVE_ESCALATION_CALL_STATUSES.has(call.status));
}

function hasActiveDeviceEscalation(db: GuaitaDatabase): boolean {
  return latestCallsByEvent(db).some((call) => {
    if (!ACTIVE_ESCALATION_CALL_STATUSES.has(call.status)) {
      return false;
    }

    return db.getEvent(call.eventId)?.source === "device";
  });
}

function latestCallsByEvent(db: GuaitaDatabase): CivilProtectionCall[] {
  const seenEventIds = new Set<string>();
  const latestCalls: CivilProtectionCall[] = [];

  for (const call of db.listCalls(50)) {
    if (seenEventIds.has(call.eventId)) {
      continue;
    }

    seenEventIds.add(call.eventId);
    latestCalls.push(call);
  }

  return latestCalls;
}

function emitCallUpdated(io: SocketServer, call: CivilProtectionCall): void {
  io.emit(SOCKET_EVENTS.callUpdated, call);
}

function acknowledgeCall(
  db: GuaitaDatabase,
  io: SocketServer,
  input: AcknowledgeCivilProtectionCallInput
): CivilProtectionCall | undefined {
  const call = findCall(db, input.callId, input.eventId ?? input.incidentId);

  if (!call) {
    return undefined;
  }

  const updatedCall: CivilProtectionCall = {
    ...call,
    status: "acknowledged",
    acknowledgement: input.notes ?? input.outcome ?? "Civil Protection acknowledged the incident.",
    acknowledgedAt: call.acknowledgedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  db.updateCall(updatedCall);
  emitCallUpdated(io, updatedCall);

  return updatedCall;
}

function findCall(db: GuaitaDatabase, callId?: string, eventId?: string): CivilProtectionCall | undefined {
  if (callId) {
    const call = db.getCall(callId);
    if (call) {
      return call;
    }
  }

  return eventId ? db.getLatestCallForEvent(eventId) : undefined;
}

function isAuthorizedCallWebhook(request: FastifyRequest<{ Querystring: { token?: string } }>): boolean {
  if (!config.elevenLabsWebhookToken) {
    return true;
  }

  const headerToken = request.headers["x-guaita-webhook-token"];
  return headerToken === config.elevenLabsWebhookToken || request.query.token === config.elevenLabsWebhookToken;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeAcknowledgementBody(value: unknown) {
  const body = asRecord(value) ?? {};

  return {
    callId: readString(body.callId) ?? readString(body.call_id),
    eventId: readString(body.eventId) ?? readString(body.event_id),
    incidentId: readString(body.incidentId) ?? readString(body.incident_id) ?? readString(body.inciden_id),
    outcome: readString(body.outcome),
    notes: readString(body.notes) ?? readString(body.note) ?? readString(body.summary)
  };
}

function extractPostCallData(webhookBody: Record<string, unknown> | undefined) {
  const data = asRecord(webhookBody?.data) ?? webhookBody ?? {};
  const metadata = asRecord(data.metadata);
  const analysis = asRecord(data.analysis);
  const initiationData = asRecord(data.conversation_initiation_client_data);
  const dynamicVariables = asRecord(initiationData?.dynamic_variables);
  const failureReason = readString(data.failure_reason) ?? readString(metadata?.termination_reason);
  const callSuccessful = readString(analysis?.call_successful);
  const webhookType = readString(webhookBody?.type);

  return {
    callId: readString(dynamicVariables?.call_id),
    eventId: readString(dynamicVariables?.incident_id) ?? readString(dynamicVariables?.event_id),
    conversationId: readString(data.conversation_id),
    transcriptSummary: readString(analysis?.transcript_summary),
    transcript: data.transcript,
    error: failureReason,
    failed: webhookType === "call_initiation_failure" || callSuccessful === "failure" || Boolean(failureReason)
  };
}

function storeDetection(input: DetectionEventInput, db: GuaitaDatabase, io: SocketServer) {
  const normalizedEvent = normalizeDetectionEvent(input);
  const station = db.getStation(normalizedEvent.stationId);

  if (!station) {
    throw new Error(`unknown_station:${normalizedEvent.stationId}`);
  }

  const storedSnapshot = storeEventSnapshot(input.snapshot, normalizedEvent.eventId);
  const event: DetectionEvent = storedSnapshot
    ? {
        ...normalizedEvent,
        imageUrl: storedSnapshot.imageUrl
      }
    : normalizedEvent;

  db.insertEvent(event);
  const severity = estimateSeverity(event, station);
  const telemetryInput = telemetryFromDetectionEvent(event);

  if (telemetryInput) {
    storeTelemetryReading(telemetryInput, db, io);
  }

  io.emit(SOCKET_EVENTS.detectionCreated, event);

  return {
    event,
    severity
  };
}

function createLiveStreamFrameFromJsonInput(input: LiveStreamFrameInput): LiveStreamFramePacket {
  const decodedFrame = decodeLiveStreamFrame(input);
  const frame = createLiveStreamFrameFromBuffer(
    {
      stationId: input.stationId,
      capturedAt: input.capturedAt ?? undefined,
      boundingBoxesEnabled: input.boundingBoxesEnabled,
      frameWidth: input.frameWidth,
      frameHeight: input.frameHeight,
      boxes: input.boxes ?? []
    },
    decodedFrame.imageBuffer
  );

  return {
    ...frame,
    dataUrl: `data:${frame.contentType};base64,${decodedFrame.imageBuffer.toString("base64")}`,
    imageBytes: decodedFrame.imageBuffer
  };
}

function createLiveStreamFrameFromBuffer(metadata: LiveStreamFrameMetadata, imageBuffer: Buffer): LiveStreamFrame {
  assertValidLiveStreamJpeg(imageBuffer);
  const receivedAt = new Date().toISOString();

  return {
    stationId: metadata.stationId,
    frameId: `frm_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    capturedAt: metadata.capturedAt ?? receivedAt,
    receivedAt,
    contentType: "image/jpeg",
    boundingBoxesEnabled: metadata.boundingBoxesEnabled ?? false,
    frameWidth: metadata.frameWidth,
    frameHeight: metadata.frameHeight,
    boxes: metadata.boxes ?? []
  };
}

function decodeLiveStreamFrame(input: LiveStreamFrameInput): DecodedLiveStreamFrame {
  const base64Data = input.data
    .trim()
    .replace(/^data:image\/jpeg;base64,/i, "")
    .replace(/\s/g, "");

  if (!base64Data || base64Data.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
    throw new LiveStreamFrameValidationError("invalid_stream_frame", 400, "Stream frame data must be valid base64 JPEG bytes.");
  }

  const paddedData = base64Data.padEnd(Math.ceil(base64Data.length / 4) * 4, "=");
  const imageBuffer = Buffer.from(paddedData, "base64");

  assertValidLiveStreamJpeg(imageBuffer);

  return {
    imageBuffer
  };
}

function assertValidLiveStreamJpeg(imageBuffer: Buffer): void {
  if (imageBuffer.length === 0) {
    throw new LiveStreamFrameValidationError("invalid_stream_frame", 400, "Stream frame image is empty.");
  }

  if (imageBuffer.length > MAX_STREAM_FRAME_BYTES) {
    throw new LiveStreamFrameValidationError("stream_frame_too_large", 413, "Stream frame image must be 750 KB or smaller.");
  }

  if (imageBuffer[0] !== 0xff || imageBuffer[1] !== 0xd8) {
    throw new LiveStreamFrameValidationError("invalid_stream_frame", 400, "Stream frame must be a JPEG image.");
  }
}

function readBooleanString(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function readPositiveIntegerString(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeOptionalIsoDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return Number.isNaN(new Date(value).getTime()) ? undefined : value;
}

function parseLiveStreamBoxesHeader(value: string | string[] | undefined): LiveStreamFrameMetadata["boxes"] {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    const input = LiveStreamFrameInputSchema.pick({ boxes: true }).safeParse({ boxes: parsed });
    return input.success ? input.data.boxes ?? [] : [];
  } catch {
    return [];
  }
}

function snapshotBaseNameForEvent(eventId: string): string {
  return Buffer.from(eventId).toString("base64url");
}

function snapshotPathForEvent(eventId: string, extension: StoredSnapshot["extension"]): string {
  return join(config.eventImagesPath, `${snapshotBaseNameForEvent(eventId)}.${extension}`);
}

function findSnapshotFile(eventId: string): StoredSnapshotFile | undefined {
  const jpegPath = snapshotPathForEvent(eventId, "jpg");
  if (existsSync(jpegPath)) {
    return {
      path: jpegPath,
      contentType: "image/jpeg"
    };
  }

  const pngPath = snapshotPathForEvent(eventId, "png");
  if (existsSync(pngPath)) {
    return {
      path: pngPath,
      contentType: "image/png"
    };
  }

  return undefined;
}

function snapshotUrlForEvent(eventId: string): string {
  const baseUrl = config.publicBaseUrl.endsWith("/") ? config.publicBaseUrl : `${config.publicBaseUrl}/`;
  return new URL(`api/events/${encodeURIComponent(eventId)}/snapshot`, baseUrl).toString();
}

function clearEventImageFiles(): void {
  rmSync(config.eventImagesPath, { recursive: true, force: true });
  mkdirSync(config.eventImagesPath, { recursive: true });
}

function storeEventSnapshot(
  snapshot: DetectionSnapshotInput | null | undefined,
  eventId: string
): { imageUrl: string } | undefined {
  if (!snapshot) {
    return undefined;
  }

  const storedSnapshot = decodeSnapshot(snapshot);
  mkdirSync(config.eventImagesPath, { recursive: true });
  writeFileSync(snapshotPathForEvent(eventId, storedSnapshot.extension), storedSnapshot.imageBuffer);

  return {
    imageUrl: snapshotUrlForEvent(eventId)
  };
}

function decodeSnapshot(snapshot: DetectionSnapshotInput): StoredSnapshot {
  const base64Data = snapshot.data
    .trim()
    .replace(/^data:image\/(?:jpeg|png);base64,/i, "")
    .replace(/\s/g, "");

  if (!base64Data || base64Data.length % 4 === 1 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
    throw new SnapshotValidationError("invalid_snapshot", 400, "Snapshot data must be valid base64 image bytes.");
  }

  const paddedData = base64Data.padEnd(Math.ceil(base64Data.length / 4) * 4, "=");
  const imageBuffer = Buffer.from(paddedData, "base64");

  return snapshotFromImageBuffer(imageBuffer);
}

function snapshotFromImageBuffer(imageBuffer: Buffer): StoredSnapshot {
  if (imageBuffer.length === 0) {
    throw new SnapshotValidationError("invalid_snapshot", 400, "Snapshot data is empty.");
  }

  if (imageBuffer.length > MAX_SNAPSHOT_BYTES) {
    throw new SnapshotValidationError("snapshot_too_large", 413, "Snapshot image must be 1 MB or smaller.");
  }

  if (imageBuffer[0] !== 0xff || imageBuffer[1] !== 0xd8) {
    if (imageBuffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return {
        imageBuffer,
        extension: "png",
        contentType: "image/png"
      };
    }

    throw new SnapshotValidationError("invalid_snapshot", 400, "Snapshot must be a JPEG or PNG image.");
  }

  return {
    imageBuffer,
    extension: "jpg",
    contentType: "image/jpeg"
  };
}

function telemetryFromDetectionEvent(event: DetectionEvent): TelemetryReadingInput | undefined {
  if (
    event.temperatureC === undefined &&
    event.humidityPct === undefined &&
    event.lightLux === undefined &&
    event.batteryPct === undefined
  ) {
    return undefined;
  }

  return {
    telemetryId: `tel_${event.eventId}`,
    stationId: event.stationId,
    observedAt: event.observedAt,
    source: event.source,
    temperatureC: event.temperatureC,
    humidityPct: event.humidityPct,
    lightLux: event.lightLux,
    batteryPct: event.batteryPct
  };
}

function storeTelemetryReading(input: TelemetryReadingInput, db: GuaitaDatabase, io: SocketServer): TelemetryReading {
  const telemetry = normalizeTelemetryReading(input);
  const station = db.getStation(telemetry.stationId);

  if (!station) {
    throw new Error(`unknown_station:${telemetry.stationId}`);
  }

  db.insertTelemetryReading(telemetry);
  io.emit(SOCKET_EVENTS.telemetryCreated, telemetry);

  return telemetry;
}
