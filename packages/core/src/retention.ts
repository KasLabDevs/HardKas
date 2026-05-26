import fs from "node:fs";
import path from "node:path";

export interface RotationResult {
  rotated: boolean;
  archivePath?: string;
  bytesRotated?: number;
  reason?: string;
}

export class TelemetryRotator {
  private static readonly DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  /**
   * Rotates the telemetry stream if it exceeds the maximum size.
   * This is a safe operation that renames the active file to an archive directory.
   */
  public static rotateIfNeeded(rootDir: string, maxSizeBytes = this.DEFAULT_MAX_SIZE_BYTES): RotationResult {
    const telemetryDir = path.join(rootDir, ".hardkas", "telemetry");
    const activeFile = path.join(telemetryDir, "telemetry.jsonl");

    if (!fs.existsSync(activeFile)) {
      return { rotated: false, reason: "File does not exist" };
    }

    const stats = fs.statSync(activeFile);
    if (stats.size < maxSizeBytes) {
      return { rotated: false, reason: `File size (${stats.size}) is below threshold (${maxSizeBytes})` };
    }

    return this.forceRotate(rootDir);
  }

  /**
   * Forces a rotation regardless of file size.
   */
  public static forceRotate(rootDir: string): RotationResult {
    const telemetryDir = path.join(rootDir, ".hardkas", "telemetry");
    const activeFile = path.join(telemetryDir, "telemetry.jsonl");

    if (!fs.existsSync(activeFile)) {
      return { rotated: false, reason: "File does not exist" };
    }

    const archiveDir = path.join(telemetryDir, "archive");
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }

    const stats = fs.statSync(activeFile);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const archiveFile = path.join(archiveDir, `telemetry-${timestamp}.jsonl`);

    // We use a simple rename. AppendCoordinator will create a new file on next append.
    try {
      fs.renameSync(activeFile, archiveFile);
      return {
        rotated: true,
        archivePath: archiveFile,
        bytesRotated: stats.size
      };
    } catch (err: any) {
      return { rotated: false, reason: `Rename failed: ${err.message}` };
    }
  }

  /**
   * Lists all archived telemetry segments.
   */
  public static listArchivedSegments(rootDir: string): string[] {
    const archiveDir = path.join(rootDir, ".hardkas", "telemetry", "archive");
    if (!fs.existsSync(archiveDir)) return [];

    return fs.readdirSync(archiveDir)
      .filter(f => f.startsWith("telemetry-") && f.endsWith(".jsonl"))
      .sort(); // Lexicographical sort works well for ISO timestamps
  }
}
