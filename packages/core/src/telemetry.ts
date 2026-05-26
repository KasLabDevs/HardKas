import fs from "node:fs";
import path from "node:path";

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

class TelemetryManager {
  private static instance: TelemetryManager;
  private rootDir: string | null = null;
  private currentContext: { seed?: number, caseId?: string, bucket?: string } = {};
  
  // Track sandboxes that need to be preserved because they hit severe anomalies
  private preservedSandboxes = new Set<string>();

  private constructor() {}

  public static getInstance(): TelemetryManager {
    if (!TelemetryManager.instance) {
      TelemetryManager.instance = new TelemetryManager();
    }
    return TelemetryManager.instance;
  }

  public init(rootDir: string) {
    this.rootDir = rootDir;
  }

  public setContext(context: { seed?: number, caseId?: string, bucket?: string }) {
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
    // If we have no root directory set, telemetry is a no-op unless explicitly writing to a sandbox.
    // Actually, in HardKAS, we often use the SDK with a specific rootDir on every call.
    // For telemetry aggregation across CLI runs, we want a centralized file.
    // If rootDir is null, we try to find it from process.cwd() or just write to sandbox.
    
    // For test matrix, the CLI runner can initialize this with the workspace root.
    const logDir = this.rootDir ? path.join(this.rootDir, ".hardkas", "telemetry") : 
                   (sandboxOverride ? path.join(sandboxOverride, ".hardkas", "telemetry") : null);
                   
    if (!logDir) return;

    const event: AnomalyEvent = {
      timestamp: new Date().toISOString(),
      seed: this.currentContext.seed,
      caseId: this.currentContext.caseId,
      bucket: this.currentContext.bucket,
      anomalyType,
      severity,
      subsystem,
      details,
      sandbox: sandboxOverride
    };

    if (severity === "high" || severity === "critical" || anomalyType === "REPLAY_RECONCILIATION" || anomalyType === "NORMALIZATION_COLLISION") {
       if (sandboxOverride) {
         this.preservedSandboxes.add(sandboxOverride);
       }
    }

    try {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      fs.appendFileSync(path.join(logDir, "telemetry.jsonl"), JSON.stringify(event) + "\n");
    } catch (err) {
      // Ignore telemetry append failures to avoid crashing the runtime
    }
  }

  public shouldPreserveSandbox(sandboxDir: string): boolean {
    return this.preservedSandboxes.has(sandboxDir);
  }
}

export const EnvironmentTelemetry = TelemetryManager.getInstance();
