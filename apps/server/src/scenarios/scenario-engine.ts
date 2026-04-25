import {
  ScenarioStateSchema,
  type DetectionEventInput,
  type ScenarioState
} from "@guaita/shared";
import {
  morningFrontierBreachScenario,
  scheduledDetectionToInput,
  type ScenarioDefinition
} from "./morning-frontier-breach.js";

const allowedSpeeds = new Set([1, 10, 60, 120, 240, 480, 720, 1440]);
const tickMs = 1_000;

interface ScenarioEngineOptions {
  onDetection: (event: DetectionEventInput) => void;
  onStateChange: (state: ScenarioState, eventName: string) => void;
}

export class ScenarioEngine {
  private readonly scenario: ScenarioDefinition;
  private readonly onDetection: (event: DetectionEventInput) => void;
  private readonly onStateChange: (state: ScenarioState, eventName: string) => void;
  private timer: ReturnType<typeof setInterval> | undefined;
  private currentTimeMs = 0;
  private speedMultiplier: number;
  private status: ScenarioState["status"] = "idle";
  private startedAt: string | undefined;
  private lastTickAt = 0;
  private readonly firedEventIds = new Set<string>();

  constructor(options: ScenarioEngineOptions, scenario = morningFrontierBreachScenario) {
    this.scenario = scenario;
    this.onDetection = options.onDetection;
    this.onStateChange = options.onStateChange;
    this.speedMultiplier = scenario.defaultSpeedMultiplier;
  }

  getState(): ScenarioState {
    const virtualStartTime = new Date(this.scenario.virtualStartIso).getTime();
    const virtualNowIso = new Date(virtualStartTime + this.currentTimeMs).toISOString();
    const nextEvent = this.scenario.events.find((event) => !this.firedEventIds.has(event.id));

    return ScenarioStateSchema.parse({
      id: this.scenario.id,
      name: this.scenario.name,
      status: this.status,
      currentTimeMs: Math.trunc(this.currentTimeMs),
      durationMs: this.durationMs,
      speedMultiplier: this.speedMultiplier,
      virtualStartIso: this.scenario.virtualStartIso,
      virtualEndIso: this.scenario.virtualEndIso,
      virtualNowIso,
      nextEventAtMs: nextEvent?.atMs ?? null,
      firedEventCount: this.firedEventIds.size,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString()
    });
  }

  start(): ScenarioState {
    if (this.status === "completed") {
      this.reset(false);
    }

    if (this.status !== "running") {
      this.status = "running";
      this.startedAt = this.startedAt ?? new Date().toISOString();
      this.startTimer();
    }

    return this.emitState("scenario.started");
  }

  pause(): ScenarioState {
    if (this.status === "running") {
      this.tick();
      this.status = "paused";
      this.stopTimer();
    }

    return this.emitState("scenario.paused");
  }

  resume(): ScenarioState {
    if (this.status === "paused") {
      this.status = "running";
      this.startTimer();
    }

    return this.emitState("scenario.resumed");
  }

  reset(emit = true): ScenarioState {
    this.stopTimer();
    this.status = "idle";
    this.currentTimeMs = 0;
    this.startedAt = undefined;
    this.firedEventIds.clear();

    const state = this.getState();
    if (emit) {
      this.onStateChange(state, "scenario.reset");
    }

    return state;
  }

  advance(ms: number): ScenarioState {
    this.moveClockBy(Math.max(0, Math.trunc(ms)));
    return this.emitState("scenario.advanced");
  }

  setSpeed(speedMultiplier: number): ScenarioState {
    if (!allowedSpeeds.has(speedMultiplier)) {
      throw new Error(`Unsupported scenario speed: ${speedMultiplier}`);
    }

    if (this.status === "running") {
      this.tick();
      this.lastTickAt = Date.now();
    }

    this.speedMultiplier = speedMultiplier;
    return this.emitState("scenario.updated");
  }

  stop(): void {
    this.stopTimer();
  }

  private get durationMs(): number {
    return new Date(this.scenario.virtualEndIso).getTime() - new Date(this.scenario.virtualStartIso).getTime();
  }

  private startTimer(): void {
    this.stopTimer();
    this.lastTickAt = Date.now();
    this.timer = setInterval(() => {
      this.tick();
    }, tickMs);
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private tick(): void {
    if (this.status !== "running") {
      return;
    }

    const now = Date.now();
    const elapsedRealMs = Math.max(0, now - this.lastTickAt);
    this.lastTickAt = now;
    this.moveClockBy(elapsedRealMs * this.speedMultiplier);
    this.emitState("scenario.updated");
  }

  private moveClockBy(ms: number): void {
    if (ms <= 0) {
      return;
    }

    const previousTimeMs = this.currentTimeMs;
    this.currentTimeMs = Math.min(this.durationMs, this.currentTimeMs + ms);

    this.emitDueDetections(previousTimeMs, this.currentTimeMs);

    if (this.currentTimeMs >= this.durationMs) {
      this.status = "completed";
      this.stopTimer();
    }
  }

  private emitDueDetections(previousTimeMs: number, currentTimeMs: number): void {
    for (const event of this.scenario.events) {
      if (this.firedEventIds.has(event.id)) {
        continue;
      }

      if (event.atMs > previousTimeMs && event.atMs <= currentTimeMs) {
        this.firedEventIds.add(event.id);
        this.onDetection(scheduledDetectionToInput(this.scenario, event));
      }
    }
  }

  private emitState(eventName: string): ScenarioState {
    const state = this.getState();
    this.onStateChange(state, eventName);
    return state;
  }
}
