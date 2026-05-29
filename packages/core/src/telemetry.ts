import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AppendCoordinator } from "./append-coordinator.js";

export type TelemetrySubsystem =
  | "lock"
  | "fs"
  | "replay"
  | "normalization"
  | "query-store"
  | "lineage"
  | "projection"
  | "unknown";

export type AnomalyType =
  | "LOCK_CONTENTION"
  | "STALE_LOCK_RECOVERY"
  | "FS_RETRY"
  | "NORMALIZATION_COLLISION"
  | "REPLAY_RECONCILIATION"
  | "EXTERNAL_MUTATION"
  | "PATH_TRAVERSAL_ATTEMPT"
  | "ORPHAN_PROJECTION_RECOVERY";

export type Severity = "low" | "medium" | "high" | "critical";

export interface AnomalyEvent {
  timestamp: string;
  seed?: number | undefined;
  caseId?: string | undefined;
  bucket?: string | undefined;
  anomalyType: AnomalyType;
  severity: Severity;
  subsystem: TelemetrySubsystem;
  details: string;
  sandbox?: string | undefined;
}

import { AsyncLocalStorage } from "node:async_hooks";

export class TelemetryManager {
  private rootDir: string | null = null;
  private currentContext: { seed?: number; caseId?: string; bucket?: string } = {};

  // Track sandboxes that need to be preserved because they hit severe anomalies
  private preservedSandboxes = new Set<string>();

  constructor(rootDir?: string) {
    if (rootDir) this.rootDir = rootDir;
  }

  public init(rootDir: string) {
    this.rootDir = rootDir;
  }

  public setContext(context: { seed?: number; caseId?: string; bucket?: string }) {
    this.currentContext = { ...this.currentContext, ...context };
  }

  public clearContext() {
    this.currentContext = {};
  }

  public getContext() {
    return this.currentContext;
  }

  public logAnomaly(
    anomalyType: AnomalyType,
    severity: Severity,
    subsystem: TelemetrySubsystem,
    details: string,
    sandboxOverride?: string
  ) {
    const logDir = this.rootDir
      ? path.join(this.rootDir, ".hardkas", "telemetry")
      : sandboxOverride
        ? path.join(sandboxOverride, ".hardkas", "telemetry")
        : null;

    if (!logDir) return;

    const nowStr = new Date().toISOString();
    const runId = this.currentContext.seed
      ? `run-${this.currentContext.seed}`
      : "run-core";
    const bucket = this.currentContext.bucket || "core";

    let mappedSeverity: "nominal" | "elevated" | "critical" = "nominal";
    if (severity === "medium") mappedSeverity = "elevated";
    else if (severity === "high" || severity === "critical") mappedSeverity = "critical";

    const canonicalPayloadRaw = JSON.stringify({
      runId,
      bucket,
      type: anomalyType,
      severity: mappedSeverity,
      caseId: this.currentContext.caseId,
      payload: {
        subsystem,
        details,
        sandbox: sandboxOverride
      }
    });
    const eventHash = crypto
      .createHash("sha256")
      .update(canonicalPayloadRaw)
      .digest("hex")
      .slice(0, 32);

    const eventIdRaw = `${eventHash}-${nowStr}`;
    const eventId = crypto
      .createHash("sha256")
      .update(eventIdRaw)
      .digest("hex")
      .slice(0, 32);

    const event = {
      schemaVersion: "hardkas.telemetry.v1",
      eventId,
      eventHash,
      timestamp: nowStr,
      source: "core-runtime",
      runId,
      bucket,
      type: anomalyType,
      severity: mappedSeverity,
      caseId: this.currentContext.caseId,
      payload: {
        subsystem,
        details,
        sandbox: sandboxOverride
      }
    };

    if (
      severity === "high" ||
      severity === "critical" ||
      anomalyType === "REPLAY_RECONCILIATION" ||
      anomalyType === "NORMALIZATION_COLLISION"
    ) {
      if (sandboxOverride) {
        this.preservedSandboxes.add(sandboxOverride);
      }
    }

    try {
      const logFile = path.join(logDir, "telemetry.jsonl");
      const root = this.rootDir || sandboxOverride || process.cwd();
      AppendCoordinator.appendAtomic(logFile, JSON.stringify(event), root);
    } catch (err) {
      // Ignore telemetry append failures to avoid crashing the runtime
    }
  }

  public shouldPreserveSandbox(sandboxDir: string): boolean {
    return this.preservedSandboxes.has(sandboxDir);
  }
}

export const telemetryContextStorage = new AsyncLocalStorage<TelemetryManager>();
export const globalTelemetry = new TelemetryManager();

export function getTelemetry(): TelemetryManager {
  return telemetryContextStorage.getStore() || globalTelemetry;
}

class TelemetryProxy {
  logAnomaly(
    anomalyType: AnomalyType,
    severity: Severity,
    subsystem: TelemetrySubsystem,
    details: string,
    sandboxOverride?: string
  ) {
    return getTelemetry().logAnomaly(
      anomalyType,
      severity,
      subsystem,
      details,
      sandboxOverride
    );
  }
  init(rootDir: string) {
    return getTelemetry().init(rootDir);
  }
  setContext(context: { seed?: number; caseId?: string; bucket?: string }) {
    return getTelemetry().setContext(context);
  }
  clearContext() {
    return getTelemetry().clearContext();
  }
  getContext() {
    return getTelemetry().getContext();
  }
  shouldPreserveSandbox(sandboxDir: string): boolean {
    return getTelemetry().shouldPreserveSandbox(sandboxDir);
  }
}

export const EnvironmentTelemetry = new TelemetryProxy();
