import { HardkasError } from "./index.js";
import { getTelemetry } from "./telemetry.js";
import fs from "node:fs";
import path from "node:path";

export const CURRENT_RUNTIME_VERSION = "0.6.0-alpha";
export const MIN_SUPPORTED_VERSION = "0.5.0-alpha";

export interface MigrationStatus {
  needsMigration: boolean;
  canDowngrade: boolean;
  currentVersion: string;
}

export class MigrationManager {
  public static checkVersion(rootDir: string): MigrationStatus {
    const versionFile = path.join(rootDir, ".hardkas", "version.json");
    if (!fs.existsSync(versionFile)) {
      // Initialize if missing
      this.writeVersion(rootDir, CURRENT_RUNTIME_VERSION);
      return { needsMigration: false, canDowngrade: true, currentVersion: CURRENT_RUNTIME_VERSION };
    }

    try {
      const data = JSON.parse(fs.readFileSync(versionFile, "utf-8"));
      const wsVersion = data.runtimeVersion || "0.0.0";
      
      if (wsVersion === CURRENT_RUNTIME_VERSION) {
        return { needsMigration: false, canDowngrade: true, currentVersion: wsVersion };
      }

      // Check for downgrade attempt
      if (this.compareSemver(wsVersion, CURRENT_RUNTIME_VERSION) > 0) {
        return { needsMigration: false, canDowngrade: false, currentVersion: wsVersion };
      }

      // Check if it's too old
      if (this.compareSemver(wsVersion, MIN_SUPPORTED_VERSION) < 0) {
        throw new HardkasError("MIGRATION_UNSUPPORTED", `Workspace version ${wsVersion} is too old to migrate to ${CURRENT_RUNTIME_VERSION}`);
      }

      return { needsMigration: true, canDowngrade: true, currentVersion: wsVersion };
    } catch (err: any) {
      if (err instanceof HardkasError) throw err;
      throw new HardkasError("MIGRATION_ERROR", `Failed to parse version.json: ${err.message}`);
    }
  }

  public static migrate(rootDir: string, dryRun = false): void {
    const status = this.checkVersion(rootDir);

    if (!status.canDowngrade) {
      throw new HardkasError("DOWNGRADE_REFUSED", `Cannot safely downgrade from workspace version ${status.currentVersion} to runtime version ${CURRENT_RUNTIME_VERSION}.`);
    }

    if (!status.needsMigration) return;

    if (dryRun) {
      console.log(`[DRY-RUN] Would migrate workspace from ${status.currentVersion} to ${CURRENT_RUNTIME_VERSION}`);
      return;
    }

    // Perform backup
    this.backupWorkspace(rootDir);

    try {
      // Run specific migrations here if needed
      this.writeVersion(rootDir, CURRENT_RUNTIME_VERSION);
    } catch (err: any) {
      getTelemetry().logAnomaly("EXTERNAL_MUTATION", "critical", "projection", `Migration failed: ${err.message}`);
      throw new HardkasError("MIGRATION_FAILED", `Migration failed, workspace might be corrupted: ${err.message}`);
    }
  }

  private static writeVersion(rootDir: string, version: string) {
    const versionFile = path.join(rootDir, ".hardkas", "version.json");
    if (!fs.existsSync(path.dirname(versionFile))) {
      fs.mkdirSync(path.dirname(versionFile), { recursive: true });
    }
    fs.writeFileSync(versionFile, JSON.stringify({ runtimeVersion: version }, null, 2));
  }

  private static backupWorkspace(rootDir: string) {
    const hardkasDir = path.join(rootDir, ".hardkas");
    const backupDir = path.join(rootDir, `.hardkas-backup-${Date.now()}`);
    
    // We only backup the projection and observability state, not canonical artifacts
    if (fs.existsSync(hardkasDir)) {
      fs.cpSync(hardkasDir, backupDir, { recursive: true });
    }
  }

  private static compareSemver(v1: string, v2: string): number {
    const parse = (v: string) => v.replace("-alpha", "").split(".").map(Number);
    const p1 = parse(v1);
    const p2 = parse(v2);
    
    for (let i = 0; i < 3; i++) {
      if ((p1[i] || 0) > (p2[i] || 0)) return 1;
      if ((p1[i] || 0) < (p2[i] || 0)) return -1;
    }
    return 0;
  }
}
