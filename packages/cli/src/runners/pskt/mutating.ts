import fs from "node:fs/promises";
import path from "node:path";
import { UI } from "../../ui.js";
import { getOutput } from "../../output.js";
import { loadSession, saveSession } from "./fs.js";
import { HardkasCliError, HardkasExitCode } from "../../cli-errors.js";
import { pskt } from "@hardkas/sdk";

export async function runPsktExport(options: { plan: string, out: string, adapter?: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);
  
  const planPath = path.resolve(options.plan);
  const planStr = await fs.readFile(planPath, "utf8");
  const plan = JSON.parse(planStr);

  const session = await pskt.exportSession(plan, options.adapter);
  
  await saveSession(session, options.out, options.force);
  if (!options.json) {
    UI.success(`PSKT session exported to ${options.out}`);
  }
}

export async function runPsktImport(options: { file: string, payload: string, out: string, force: boolean, json: boolean }) {
  throw new HardkasCliError("PSKT_NOT_IMPLEMENTED", "import command not fully implemented yet", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
}

export async function runPsktSign(sessionPath: string, options: { account?: string, keystore?: string, keyStdin?: boolean, privateKeyFile?: string, out: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);

  let privateKey: string | undefined;

  if (options.privateKeyFile) {
    if (process.env.NODE_ENV !== "test") {
      UI.warning("--private-key-file is intended for TEST ONLY.");
    }
    privateKey = (await fs.readFile(path.resolve(options.privateKeyFile), "utf8")).trim();
  } else if (options.keyStdin) {
    // Read from stdin... not implemented for brevity
    throw new HardkasCliError("PSKT_NOT_IMPLEMENTED", "stdin not implemented in this prototype", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  } else if (options.account) {
    throw new HardkasCliError("PSKT_NOT_IMPLEMENTED", "Wallet integration for signing not yet implemented", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  } else if (options.keystore) {
    throw new HardkasCliError("PSKT_NOT_IMPLEMENTED", "Keystore integration for signing not yet implemented", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  } else {
    throw new HardkasCliError("INVALID_ARGUMENT", "You must provide a signing source (--account, --keystore, --key-stdin, or --private-key-file)", { exitCode: HardkasExitCode.USAGE_ERROR });
  }

  const session = await loadSession(sessionPath);
  
  const request = {
    participantId: options.account || "cli-user",
    privateKey // This would ideally be passed securely or resolved by the adapter in a real system
  };

  const newSession = await pskt.signSession(session, request);
  await saveSession(newSession, options.out, options.force);

  if (!options.json) {
    UI.success(`PSKT session signed and saved to ${options.out}`);
  }
}

export async function runPsktMerge(sessionA: string, sessionB: string, options: { out: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);

  const sA = await loadSession(sessionA);
  const sB = await loadSession(sessionB);

  const merged = await pskt.mergeSessions([sA, sB]);
  await saveSession(merged, options.out, options.force);

  if (!options.json) {
    UI.success(`PSKT sessions merged and saved to ${options.out}`);
  }
}

export async function runPsktFinalize(sessionPath: string, options: { out: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);

  const session = await loadSession(sessionPath);
  const finalized = await pskt.finalizeSession(session);

  await saveSession(finalized, options.out, options.force);

  if (!options.json) {
    UI.success(`PSKT session finalized and saved to ${options.out}`);
  }
}

export async function runPsktExtract(sessionPath: string, options: { out: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);

  const session = await loadSession(sessionPath);
  const tx = await pskt.extractSession(session);

  // tx is a KaspaRpcTransaction (or whatever format)
  // We need to atomic write it
  const outPath = path.resolve(options.out);
  if (!options.force) {
    try {
      await fs.access(outPath);
      throw new HardkasCliError("INVALID_ARGUMENT", `Output file already exists: ${options.out}. Use --force to overwrite.`, { exitCode: HardkasExitCode.USAGE_ERROR });
    } catch (e: any) {
      if (e.code !== "ENOENT" && !(e instanceof HardkasCliError)) throw e;
      if (e instanceof HardkasCliError) throw e;
    }
  }

  const tempPath = `${outPath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(tx, null, 2) + "\n", { mode: 0o600, flag: "w" });
    await fs.rename(tempPath, outPath);
  } catch (err: any) {
    try { await fs.unlink(tempPath); } catch (_) {}
    throw new HardkasCliError(`Failed to save extracted transaction: ${err.message}`, HardkasExitCode.RUNTIME_FAILURE);
  }

  if (!options.json) {
    UI.success(`Transaction extracted to ${options.out}`);
  }
}
