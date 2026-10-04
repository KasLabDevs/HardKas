import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { HardkasError, withLock, writeFileAtomic } from "@hardkas/core";

/**
 * ARTIFACT-MUTATION-1: every mutation of `<workspace>/.hardkas/artifacts/**` made by cooperative HardKAS code goes
 * through this gate and happens under the workspace's `artifacts` lock, taken reentrantly (writes made inside a unit
 * held with `hold` join its holding). This module is the only code that touches the store's files and directories
 * physically; packages/artifacts/test/artifact-mutation-guard.test.ts keeps it that way.
 */
export class ArtifactStoreMutation {
  /** The workspace whose store this is; its `artifacts` lock lives in `<workspace>/.hardkas/locks`. */
  readonly workspaceRoot: string;
  /** `<workspace>/.hardkas/artifacts`. */
  readonly storeDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.storeDir = path.join(this.workspaceRoot, ".hardkas", "artifacts");
  }

  /** The store a path is in (or is), with the path relative to it; undefined outside any artifact store. */
  static forPath(filePath: string): { store: ArtifactStoreMutation; relPath: string } | undefined {
    const same = (a: string, b: string) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);
    const abs = path.resolve(filePath);
    for (let dir = abs; ; dir = path.dirname(dir)) {
      const parent = path.dirname(dir);
      if (same(path.basename(dir), "artifacts") && same(path.basename(parent), ".hardkas")) {
        return { store: new ArtifactStoreMutation(path.dirname(parent)), relPath: path.relative(dir, abs) };
      }
      if (parent === dir) return undefined;
    }
  }

  /**
   * Writes a file of the store: an atomic replace by default; with `exclusive`, it is created only if absent and an
   * existing file is never overwritten (EEXIST). `mode` sets the file permissions, as the plain writers did.
   */
  async writeFile(relPath: string, data: string | Uint8Array, options: { exclusive?: boolean; mode?: number } = {}): Promise<string> {
    const target = this.resolveInside(relPath, false);
    // awaited (not returned) so the gate stays on async stacks, where runtime checks look for it
    return await this.underLock(async () => {
      this.assertNoLinkEscape(path.dirname(target));
      await fsp.mkdir(path.dirname(target), { recursive: true });
      this.assertNoLinkEscape(path.dirname(target));
      if (options.exclusive) {
        await fsp.writeFile(target, data, { flag: "wx", ...(options.mode !== undefined ? { mode: options.mode } : {}) });
      } else {
        await writeFileAtomic(target, typeof data === "string" ? data : Buffer.from(data), options.mode !== undefined ? { mode: options.mode } : {});
      }
      return target;
    });
  }

  /** Creates a directory of the store (the store itself by default). */
  async ensureDir(relDir = ""): Promise<string> {
    const target = this.resolveInside(relDir, true);
    return await this.underLock(async () => {
      this.assertNoLinkEscape(target);
      await fsp.mkdir(target, { recursive: true });
      this.assertNoLinkEscape(target);
      return target;
    });
  }

  /**
   * Runs fn as one unit of the store: inside a single holding of `artifacts`, which the gate's writes made from fn join.
   * No other cooperative writer or reader of the store can come in between fn's reads and writes.
   */
  async hold<T>(fn: () => Promise<T>, command = "artifact store unit"): Promise<T> {
    return await this.underLock(fn, command);
  }

  private underLock<T>(fn: () => Promise<T>, command = "artifact store mutation"): Promise<T> {
    return withLock({ rootDir: this.workspaceRoot, name: "artifacts", command, wait: true }, fn);
  }

  private resolveInside(relPath: string, allowStoreItself: boolean): string {
    const target = path.resolve(this.storeDir, relPath);
    const rel = path.relative(this.storeDir, target);
    const inside = rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel) && (allowStoreItself || rel !== "");
    if (!inside) {
      throw new HardkasError("ARTIFACT_PATH_OUTSIDE_STORE", `${relPath} resolves outside the artifact store ${this.storeDir}; nothing was written`);
    }
    return target;
  }

  /** Refuses a path whose nearest existing ancestor inside the store really lives elsewhere (a link out of the store). */
  private assertNoLinkEscape(dir: string): void {
    let probe = dir;
    while (!fs.existsSync(probe)) {
      const up = path.dirname(probe);
      if (up === probe) return;
      probe = up;
    }
    const relToStore = path.relative(this.storeDir, probe);
    if (relToStore === ".." || relToStore.startsWith(`..${path.sep}`) || path.isAbsolute(relToStore)) return; // the store is not created yet
    const real = path.relative(fs.realpathSync.native(this.storeDir), fs.realpathSync.native(probe));
    if (real === ".." || real.startsWith(`..${path.sep}`) || path.isAbsolute(real)) {
      throw new HardkasError("ARTIFACT_PATH_OUTSIDE_STORE", `${dir} is linked outside the artifact store ${this.storeDir}; nothing was written`);
    }
  }
}

/**
 * A write to a caller-chosen path (an `--out`, an export): through the gate when the path is inside an artifact store,
 * otherwise exactly the caller's own plain write.
 */
export async function writeFileRespectingStore(filePath: string, data: string | Uint8Array, plainWrite: () => unknown): Promise<void> {
  const inStore = ArtifactStoreMutation.forPath(filePath);
  if (inStore && inStore.relPath) {
    await inStore.store.writeFile(inStore.relPath, data);
    return;
  }
  await plainWrite();
}

/** mkdir -p for a directory that may be (in) an artifact store: through the gate there, a plain mkdir elsewhere. */
export async function ensureDirRespectingStore(dir: string): Promise<void> {
  const inStore = ArtifactStoreMutation.forPath(dir);
  if (inStore) {
    await inStore.store.ensureDir(inStore.relPath);
    return;
  }
  await fsp.mkdir(dir, { recursive: true });
}
