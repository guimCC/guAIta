import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Server as SocketServer } from "socket.io";
import {
  AcknowledgeCivilProtectionCallInputSchema,
  StartCivilProtectionCallInputSchema,
  DetectionEventInputSchema,
  SOCKET_EVENTS,
  type CivilProtectionCall,
  type DetectionEvent,
  type DetectionEventInput,
  type DetectionSource
} from "@guaita/shared";
import { config } from "./config.js";
import { GuaitaDatabase } from "./db/database.js";
import {
  createCivilProtectionCallRecord,
  placeElevenLabsOutboundCall
} from "./domain/civil-protection-calls.js";
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

    let call = createCivilProtectionCallRecord(
      event,
      station,
      toNumber,
      config.callsEnabled ? "elevenlabs" : "demo"
    );
    db.insertCall(call);
    emitCallUpdated(io, call);

    if (!config.callsEnabled) {
      return reply.code(202).send({
        ok: true,
        call,
        message: "Call record stored. Set CALLS_ENABLED=true and ElevenLabs credentials to place the real outbound call."
      });
    }

    try {
      const outboundCall = await placeElevenLabsOutboundCall(call, event, station);
      call = {
        ...call,
        status: "calling",
        conversationId: outboundCall.conversationId,
        callSid: outboundCall.callSid,
        updatedAt: new Date().toISOString()
      };
      db.updateCall(call);
      emitCallUpdated(io, call);

      return reply.code(201).send({
        ok: true,
        call
      });
    } catch (error) {
      call = {
        ...call,
        status: "failed",
        error: error instanceof Error ? error.message : "Outbound call failed.",
        updatedAt: new Date().toISOString()
      };
      db.updateCall(call);
      emitCallUpdated(io, call);

      return reply.code(502).send({
        ok: false,
        error: "outbound_call_failed",
        message: call.error,
        call
      });
    }
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

      const parsed = AcknowledgeCivilProtectionCallInputSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.code(400).send({
          ok: false,
          error: "invalid_acknowledgement",
          issues: parsed.error.flatten()
        });
      }

      const call = findCall(db, parsed.data.callId, parsed.data.eventId ?? parsed.data.incidentId);
      if (!call) {
        return reply.code(404).send({
          ok: false,
          error: "unknown_call"
        });
      }

      const updatedCall: CivilProtectionCall = {
        ...call,
        status: "acknowledged",
        acknowledgement: parsed.data.notes ?? parsed.data.outcome ?? "Civil Protection acknowledged the incident.",
        acknowledgedAt: call.acknowledgedAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      db.updateCall(updatedCall);
      emitCallUpdated(io, updatedCall);

      return {
        ok: true,
        call: updatedCall
      };
    }
  );

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
      const updatedCall: CivilProtectionCall = {
        ...call,
        status: call.status === "acknowledged" ? "acknowledged" : extracted.failed ? "failed" : "completed",
        conversationId: extracted.conversationId ?? call.conversationId,
        transcriptSummary: extracted.transcriptSummary ?? call.transcriptSummary,
        transcript: extracted.transcript ?? call.transcript,
        error: extracted.error ?? call.error,
        completedAt,
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

    return createDetection(request, reply, "device", db, io, (event) => {
      if (event.source === "device" && scenarioEngine.getState().status === "running") {
        scenarioEngine.pause();
      }
    });
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
  io: SocketServer,
  onStored?: (event: DetectionEvent) => void
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
    onStored?.(event);

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

function emitCallUpdated(io: SocketServer, call: CivilProtectionCall): void {
  io.emit(SOCKET_EVENTS.callUpdated, call);
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
