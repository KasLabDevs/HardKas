import path from "node:path";
import fs from "node:fs";
import { HardkasError, plainChildPath } from "@hardkas/core";
import { validateAccountName } from "@hardkas/accounts";

/**
 * Deterministic Workspace Abstraction.
 * Encapsulates all filesystem boundary interactions and isolates paths
 * from the global process.cwd(), ensuring agent/script replayability.
 */
export class HardkasWorkspace {
  public readonly root: string;
  private readonly overrideHardkasDir?: string | undefined;

  constructor(cwd: string, overrideHardkasDir?: string | undefined) {
    // Resolve absolute path immediately to freeze the boundary
    this.root = path.resolve(cwd);
    if (overrideHardkasDir !== undefined) {
      this.overrideHardkasDir = overrideHardkasDir;
    }
  }

  get hardkasDir(): string {
    return this.overrideHardkasDir || path.join(this.root, ".hardkas");
  }

  get artifactsDir(): string {
    return path.join(this.hardkasDir, "artifacts");
  }

  get localnetStatePath(): string {
    return path.join(this.hardkasDir, "localnet.json");
  }

  get keystoreDir(): string {
    return path.join(this.hardkasDir, "keystore");
  }

  /**
   * CONTAINMENT-2 (R1-I1): the keystore file of account `name`, decided before anything is read or written: `name` is
   * a valid account name and its keystore is ONE plain file directly in keystoreDir (which honours a configured
   * hardkasDir). An existing entry there that is not a plain file (a link or a directory) is refused too, so nothing
   * is ever read or replaced through it. Refusals are ACCOUNT_NAME_INVALID.
   */
  keystorePath(name: unknown): string {
    const refuse = (why: string) =>
      new HardkasError("ACCOUNT_NAME_INVALID", `${JSON.stringify(name)} is not an account name: ${why}. Nothing was read or written.`);
    if (typeof name !== "string") throw refuse("an account name is a string");
    try {
      validateAccountName(name);
    } catch (e) {
      throw refuse(e instanceof Error ? e.message : String(e));
    }
    const file = plainChildPath(this.keystoreDir, `${name}.json`);
    if (!file) throw refuse(`its keystore would not be one plain file in ${this.keystoreDir}`);
    let entry: fs.Stats | undefined;
    try {
      entry = fs.lstatSync(file);
    } catch {
      entry = undefined;
    }
    if (entry && !entry.isFile()) throw refuse(`${file} exists and is not a plain file`);
    return file;
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
