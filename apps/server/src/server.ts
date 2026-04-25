import cors from "@fastify/cors";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { Server as SocketServer } from "socket.io";
import {
  AcknowledgeCivilProtectionCallInputSchema,
  StartCivilProtectionCallInputSchema,
  DetectionEventInputSchema,
  SOCKET_EVENTS,
  TelemetryReadingInputSchema,
  type AcknowledgeCivilProtectionCallInput,
  type CivilProtectionCall,
  type DetectionEvent,
  type DetectionEventInput,
  type DetectionSource,
  type TelemetryReading,
  type TelemetryReadingInput
} from "@guaita/shared";
import { config } from "./config.js";
import { GuaitaDatabase } from "./db/database.js";
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

  app.get("/api/telemetry", async (request: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = request.query.limit ? Number(request.query.limit) : 100;
    return {
      telemetry: db.listTelemetryReadings(Number.isFinite(limit) ? limit : 100)
    };
  });

  app.get("/api/telemetry/latest", async () => ({
    telemetry: db.listLatestTelemetryReadings()
  }));

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

  app.post("/api/summary/generate-simulation", async () => {
    const stations = db.listStations();
    const now = new Date();
    const startTime = new Date(now.getTime() - 48 * 60 * 60_000); // 48 hours ago
    
    // Clear old events to start fresh for simulation
    db.clearEvents();

    const eventsToInsert: DetectionEvent[] = [];
    const telemetryToInsert: TelemetryReading[] = [];

    // North stations are those with higher latitude
    const sortedStations = [...stations].sort((a, b) => b.latitude - a.latitude);
    const northStations = sortedStations.slice(0, Math.floor(stations.length / 2));
    const southStations = sortedStations.slice(Math.floor(stations.length / 2));

    // Generate data hour by hour
    for (let h = 0; h < 48; h++) {
      const currentHourTime = new Date(startTime.getTime() + h * 60 * 60_000);
      const hour = currentHourTime.getHours();
      const isDaylight = hour >= 7 && hour <= 20;
      
      for (const station of stations) {
        // Base temperature: Day is hotter, South is hotter
        const isNorth = northStations.includes(station);
        let temp = 15 + Math.sin((hour - 6) * Math.PI / 12) * 10; // 15-25 range
        if (isNorth) temp -= 3; // North side is colder
        if (!isDaylight) temp -= 5; // Night is colder
        
        const humidity = 60 + Math.random() * 20;

        // Telemetry
        const telemetry: TelemetryReading = {
          telemetryId: `sim_tel_${h}_${station.id}`,
          stationId: station.id,
          observedAt: currentHourTime.toISOString(),
          source: "scenario",
          temperatureC: temp + (Math.random() * 2 - 1),
          humidityPct: humidity,
          lightLux: isDaylight ? (500 + Math.random() * 500) : (5 + Math.random() * 10),
          batteryPct: 90 + Math.random() * 10
        };
        db.insertTelemetryReading(telemetry);

        // Boar detection probability
        // Peste Porcina behavior: 
        // 1. Usually nocturnal (low daylight prob)
        // 2. If sick, they look for shade/cold (North) and water
        // 3. Occasionally disoriented in daylight
        
        let detectionProb = 0.05; // Base probability per hour
        if (!isDaylight) detectionProb = 0.15; // Natural nocturnal activity
        if (isDaylight && Math.random() < 0.1) detectionProb = 0.1; // Anomalous daylight activity (sick indicator)
        if (temp > 22 && isNorth) detectionProb *= 2; // Seeking cold

        if (Math.random() < detectionProb) {
          const count = Math.random() > 0.8 ? Math.floor(Math.random() * 5) + 2 : 1;
          const event: DetectionEvent = {
            eventId: `sim_evt_${h}_${station.id}`,
            stationId: station.id,
            observedAt: currentHourTime.toISOString(),
            source: "scenario",
            species: "wild_boar",
            confidence: 0.7 + Math.random() * 0.25,
            count,
            direction: Math.random() > 0.7 ? "towards_city" : "towards_forest",
            temperatureC: temp,
            humidityPct: humidity,
            lightLux: telemetry.lightLux
          };
          db.insertEvent(event);
        }
      }
    }

    return {
      ok: true,
      message: "Generated 48 hours of synthetic Peste Porcina data."
    };
  });

  app.get("/api/summary/expert-analysis", async () => {
    const events = db.listEvents(500);
    const stations = db.listStations();
    
    if (events.length === 0) {
      return {
        ok: true,
        analysis: "No data available for analysis. Please generate simulation data first."
      };
    }

    // Analysis logic
    const daylightEvents = events.filter(e => {
      const hour = new Date(e.observedAt).getHours();
      return hour >= 8 && hour <= 19;
    });

    const towardsCityCount = events.filter(e => e.direction === "towards_city").length;
    
    // Group by station for Heatmap
    const stationStats = new Map<string, { count: number; daylightCount: number; towardsCity: number }>();
    events.forEach(e => {
      const stats = stationStats.get(e.stationId) || { count: 0, daylightCount: 0, towardsCity: 0 };
      const hour = new Date(e.observedAt).getHours();
      stats.count += e.count;
      if (hour >= 8 && hour <= 19) stats.daylightCount += e.count;
      if (e.direction === "towards_city") stats.towardsCity += e.count;
      stationStats.set(e.stationId, stats);
    });

    const stationMetrics = Array.from(stationStats.entries()).map(([id, s]) => ({
      stationId: id,
      ...s
    }));

    const topStationEntry = [...stationStats.entries()].sort((a, b) => b[1].count - a[1].count)[0];
    const topStation = stations.find(s => s.id === topStationEntry[0]);

    // Heat response & Thermal Gradient
    const sortedStations = [...stations].sort((a, b) => b.latitude - a.latitude);
    const northStations = sortedStations.slice(0, Math.floor(stations.length / 2));
    const southStations = sortedStations.slice(Math.floor(stations.length / 2));

    const northActivity = events.filter(e => northStations.some(s => s.id === e.stationId)).reduce((acc, e) => acc + e.count, 0);
    const southActivity = events.filter(e => southStations.some(s => s.id === e.stationId)).reduce((acc, e) => acc + e.count, 0);

    // Hourly distribution for activity chart
    const hourlyActivity = new Array(24).fill(0);
    events.forEach(e => {
      const hour = new Date(e.observedAt).getHours();
      hourlyActivity[hour] += e.count;
    });
    
    // Expert Gemma Persona Text Generation
    const daylightPct = Math.round((daylightEvents.length / events.length) * 100);
    const riskLevel = daylightPct > 15 ? "CRITICAL" : "MODERATE";

    // ----------------------------------------------------------------------
    // PREPARED GEMMA 4 PROMPT (For future integration)
    // ----------------------------------------------------------------------
    const gemmaPrompt = `
      System: You are an expert Veterinary Epidemiologist specializing in African Swine Fever (ASF).
      Your task is to analyze sensor data from the Collserola Park and provide a concise operational report.

      Data:
      - Total Encounters (48h): ${events.reduce((acc, e) => acc + e.count, 0)}
      - Daylight Activity: ${daylightPct}% (Healthy boars are usually nocturnal. High daylight activity indicates disorientation/virus)
      - Hotspot: ${topStation?.name}
      - Thermal Distribution: North (Cold/Shadow): ${northActivity}, South (Exposed/Hot): ${southActivity}
      - Urban Pressure: ${towardsCityCount} boars moving towards the city grid.

      Format the response as:
      ### VETERINARY EPIDEMIOLOGICAL REPORT: African Swine Fever (ASF) Risk
      **Status:** [CRITICAL or MODERATE] - Monitoring active across ${stations.length} stations.
      
      **1. Behavioral Anomalies:** ...
      **2. Environmental Correlation:** ...
      **3. Urban Pressure & Containment:** ...
      **Expert Recommendation:** ...
    `;

    console.log("[GEMMA 4 PROMPT READY]:\n", gemmaPrompt);

    // MOCKED GEMMA 4 RESPONSE (Until API is connected)
    const analysisText = `
### VETERINARY EPIDEMIOLOGICAL REPORT: African Swine Fever (ASF) Risk
**Status:** ${riskLevel} - Monitoring active across ${stations.length} stations.

**1. Behavioral Anomalies:**
We have detected that **${daylightPct}%** of wild boar activity is occurring during broad daylight. In healthy populations, boars are strictly crepuscular or nocturnal. This level of daylight activity is a strong biological indicator of viral neuro-infection causing disorientation, typical of the African Swine Fever virus.

**2. Environmental Correlation:**
With temperatures hitting peaks of up to ${Math.max(...events.map(e => e.temperatureC || 0).filter(Boolean)).toFixed(1)}°C, we observed a significant clustering of detections at **${topStation?.name || topStation?.id}**. The data shows sick individuals are abandoning their usual territories to seek out the thermal shadow of the North mountain face (**${northActivity} encounters**) vs the South face (**${southActivity} encounters**).

**3. Urban Pressure & Containment:**
A total of **${towardsCityCount} detections** show movement **towards the urban grid**. This is extremely high risk. These individuals may act as vectors, potentially carrying the virus into contact with humans or pets, and eventually reaching commercial pork facilities.

**Expert Recommendation:**
Immediate deployment of "Rural Agents" to the northern perimeter of **${topStation?.name}**. Focus on areas with high humidity. Any individual seen during daylight hours should be considered infected and handled under strict biocontainment protocols.
    `;

    return {
      ok: true,
      analysis: analysisText.trim(),
      metrics: {
        daylightPct,
        towardsCityCount,
        topStation: topStation?.name,
        totalCount: events.reduce((acc, e) => acc + e.count, 0),
        thermalGradient: { north: northActivity, south: southActivity },
        hourlyActivity
      }
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

    return createDetection(request, reply, "device", db, io, (event) => {
      if (event.source === "device" && scenarioEngine.getState().status === "running") {
        scenarioEngine.pause();
      }
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

  app.post("/api/manual/events", async (request, reply) => {
    return createDetection(request, reply, "manual", db, io);
  });

  return { app, db, io };
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
  const event = normalizeDetectionEvent(input);
  const station = db.getStation(event.stationId);

  if (!station) {
    throw new Error(`unknown_station:${event.stationId}`);
  }

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
