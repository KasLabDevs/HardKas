import path from "node:path";
import fs from "node:fs";

/**
 * Deterministic Workspace Abstraction.
 * Encapsulates all filesystem boundary interactions and isolates paths
 * from the global process.cwd(), ensuring agent/script replayability.
 */
export class HardkasWorkspace {
  public readonly root: string;

  constructor(cwd: string) {
    // Resolve absolute path immediately to freeze the boundary
    this.root = path.resolve(cwd);
  }

  get hardkasDir(): string {
    return path.join(this.root, ".hardkas");
  }

  get artifactsDir(): string {
    return path.join(this.hardkasDir, "artifacts");
  }

  get localnetStatePath(): string {
    return path.join(this.hardkasDir, "localnet-state.json");
  }

  get keystoreDir(): string {
    return path.join(this.hardkasDir, "keystore");
  }

  /**
   * Safely resolves a path relative to the workspace root.
   */
  resolvePath(...segments: string[]): string {
    return path.resolve(this.root, ...segments);
  }

  /**
   * Safely builds a relative path from the workspace root to the target.
   */
  relativeFromRoot(absolutePath: string): string {
    return path.relative(this.root, absolutePath);
  }

  /**
   * Ensures the core .hardkas directory exists.
   */
  ensureHardkasDir(): void {
    if (!fs.existsSync(this.hardkasDir)) {
      fs.mkdirSync(this.hardkasDir, { recursive: true });
    }
  }
}
