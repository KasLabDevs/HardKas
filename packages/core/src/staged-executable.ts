import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * SC-02 · what starts is the bytes that were verified, not whatever sits at the toolchain path when the process starts.
 *
 * A managed toolchain is verified file by file against its pin, but the file is then started by path: between the check
 * and the start a process of the same user that can write under HARDKAS_HOME could replace it (or, on Windows, drop a DLL
 * next to it). The executable is therefore read ONCE, that read is hashed and compared with the pin, the same bytes are
 * written to a private copy in a new directory (`<home>/run/<tool>/<tool>-XXXXXX/`, mode 0o700, created exclusively), and
 * the copy is hashed again right before it starts. This is the staging the SilverScript runner already applies
 * (silverscript-runner.ts `stageSilverRunner`). The residual window between the last hash and the start (tens of
 * milliseconds; Node.js has no atomic check-and-exec) is the same documented limit (R-08).
 *
 * Internal to @hardkas/core: not re-exported from the package index.
 */
export interface StagedExecutable {
  /** The private copy that runs. */
  readonly path: string;
  /** The digest of the bytes that run (equal to the pin). */
  readonly sha256: string;
  /** Throws `changedCode` if the copy no longer holds those bytes: call it right before each start. */
  verify(): void;
  /** Removes the copy (best effort, never throws; retries while Windows still holds the file). */
  cleanup(): void;
}

export interface StagePinnedExecutableOptions {
  /** The verified toolchain file. */
  readonly source: string;
  /** The pinned SHA-256 of that file. */
  readonly expectedSha256: string;
  /** Directory under which the private copy's directory is created. */
  readonly stageRoot: string;
  /** File name of the copy (keep the platform extension, e.g. `silverc.exe`). */
  readonly fileName: string;
  /** Short name used in messages and as the copy directory prefix. */
  readonly label: string;
  /** Code when the source read does not match the pin. */
  readonly mismatchCode: string;
  /** Code when the private copy changed before the start. */
  readonly changedCode: string;
  /** Code when the private copy cannot be made. */
  readonly stageFailedCode: string;
}

function codedError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const sha256Hex = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");

export function stagePinnedExecutable(o: StagePinnedExecutableOptions): StagedExecutable {
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(o.source);
  } catch (e: any) {
    throw codedError(o.mismatchCode, `${o.source} cannot be read (${e?.code ?? e?.message}); it was not executed`);
  }
  const sha256 = sha256Hex(bytes);
  if (sha256 !== o.expectedSha256.toLowerCase()) {
    throw codedError(
      o.mismatchCode,
      `${o.source} is not the pinned ${o.label} (sha256 ${o.expectedSha256} pinned, ${sha256} read); it was not executed`
    );
  }
  let dir: string;
  try {
    fs.mkdirSync(o.stageRoot, { recursive: true });
    dir = fs.mkdtempSync(path.join(o.stageRoot, `${o.label}-`));
  } catch (e: any) {
    throw codedError(o.stageFailedCode, `the private copy of ${o.label} cannot be made under ${o.stageRoot}: ${e?.code ?? e?.message}`);
  }
  const file = path.join(dir, o.fileName);
  try {
    fs.writeFileSync(file, bytes, { mode: 0o700, flag: "wx" });
  } catch (e: any) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw codedError(o.stageFailedCode, `the private copy of ${o.label} cannot be written: ${e?.code ?? e?.message}`);
  }
  return {
    path: file,
    sha256,
    verify: () => {
      let now: string;
      try {
        now = sha256Hex(fs.readFileSync(file));
      } catch (e: any) {
        throw codedError(o.changedCode, `the private copy of ${o.label} is gone before it started (${e?.code ?? e?.message}); it was not executed`);
      }
      if (now !== sha256) {
        throw codedError(
          o.changedCode,
          `the private copy of ${o.label} changed before it started (sha256 ${sha256} staged, ${now} now); it was not executed`
        );
      }
    },
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // a copy left behind holds the pinned bytes and is never started again
      }
    }
  };
}
