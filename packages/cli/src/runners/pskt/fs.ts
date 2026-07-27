import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { pskt } from "@hardkas/sdk";
import type { PortableSigningSession } from "@hardkas/core";
import { HardkasCliError, HardkasExitCode } from "../../cli-errors.js";

/**
 * Safely loads a PortableSigningSession from a file.
 * Automatically checks for sensitive material via deserializeSession.
 */
export async function loadSession(filePath: string): Promise<PortableSigningSession> {
  try {
    const content = await fs.readFile(path.resolve(filePath), "utf8");
    return pskt.deserializeSession(content);
  } catch (err: any) {
    if (err instanceof Error && err.message.includes("ENOENT")) {
      throw new HardkasCliError("FILE_NOT_FOUND", `Session file not found: ${filePath}`, { exitCode: HardkasExitCode.USAGE_ERROR });
    }
    throw new HardkasCliError("INVALID_SESSION", `Invalid session file: ${err.message}`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
}

/**
 * Atomically writes a PortableSigningSession to a file.
 * Enforces O_EXCL unless force=true.
 */
export async function saveSession(session: PortableSigningSession, filePath: string, force: boolean) {
  const absolutePath = path.resolve(filePath);
  
  if (!force) {
    try {
      await fs.access(absolutePath);
      throw new HardkasCliError("FILE_EXISTS", `Output file already exists: ${filePath}. Use --force to overwrite.`, { exitCode: HardkasExitCode.USAGE_ERROR });
    } catch (e: any) {
      if (e.code !== "ENOENT" && !(e instanceof HardkasCliError)) {
        throw e;
      }
      if (e instanceof HardkasCliError) throw e;
    }
  }

  // Atomic write via temp file
  const tempPath = `${absolutePath}.tmp.${crypto.randomBytes(4).toString("hex")}`;
  try {
    const data = JSON.stringify(session, null, 2) + "\n";
    // Write to temp file with restrictive permissions
    await fs.writeFile(tempPath, data, { mode: 0o600, flag: "w" });
    // Rename over the target file
    await fs.rename(tempPath, absolutePath);
  } catch (err: any) {
    try {
      await fs.unlink(tempPath);
    } catch (_) {
      // ignore
    }
    throw new HardkasCliError("SAVE_FAILED", `Failed to save session: ${err.message}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }
}
