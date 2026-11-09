import fs from "node:fs/promises";
import path from "node:path";
import { UI } from "../../ui.js";
import { getOutput } from "../../output.js";
import { loadSession, saveSession } from "./fs.js";
import { HardkasCliError, HardkasExitCode } from "../../cli-errors.js";
import { pskt } from "@hardkas/sdk";
import { ArtifactStoreMutation } from "@hardkas/artifacts";
import { stripBom } from "@hardkas/core";

export async function runPsktExport(options: { plan: string, out: string, adapter?: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);
  
  const planPath = path.resolve(options.plan);
  const planStr = await fs.readFile(planPath, "utf8");
  const plan = JSON.parse(stripBom(planStr));

  const session = await pskt.exportSession(plan, options.adapter);
  
  await saveSession(session, options.out, options.force);
  if (!options.json) {
    UI.success(`PSKT session exported to ${options.out}`);
  }
}

export async function runPsktImport(options: { file: string, payload: string, out: string, force: boolean, json: boolean }) {
  throw new HardkasCliError("PSKT_NOT_IMPLEMENTED", "import command not fully implemented yet", { exitCode: HardkasExitCode.RUNTIME_FAILURE });
}

/**
 * TX-09: the inputs a `pskt sign` signs: `--inputs 0,2` when given, else the session requirements this participant is
 * eligible for. Never an empty list (the adapters refuse one), never every input by default.
 */
export function psktInputsToSign(
  session: { requirements?: readonly { inputIndex: number; eligibleParticipants?: readonly string[] }[] },
  participantId: string,
  inputs?: string
): number[] {
  if (inputs !== undefined) {
    const parts = String(inputs).split(",").map((s) => s.trim()).filter((s) => s !== "");
    const indexes = parts.map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
    if (indexes.length === 0 || indexes.some((i) => !Number.isSafeInteger(i)) || new Set(indexes).size !== indexes.length) {
      throw new HardkasCliError("INVALID_ARGUMENT", `--inputs ${JSON.stringify(inputs)} must be a comma-separated list of distinct input indexes (e.g. 0,2).`, { exitCode: HardkasExitCode.USAGE_ERROR });
    }
    return indexes;
  }
  const eligible = (session.requirements ?? []).filter((r) => (r.eligibleParticipants ?? []).includes(participantId)).map((r) => r.inputIndex);
  if (eligible.length === 0) {
    throw new HardkasCliError(
      "INVALID_ARGUMENT",
      `No input of this session names "${participantId}" as an eligible signer; pass --inputs <indexes> to choose them explicitly. Nothing was signed.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  return eligible;
}

export async function runPsktSign(sessionPath: string, options: { account?: string, keystore?: string, keyStdin?: boolean, privateKeyFile?: string, inputs?: string, out: string, force: boolean, json: boolean }) {
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

  // TX-09: the adapters read `keyMaterial` (bytes) and refuse an empty `inputIndexes`; this used to pass `privateKey`
  // (a field no adapter reads) and `inputIndexes: []`, so `hardkas pskt sign` could never sign
  if (!privateKey || !/^[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new HardkasCliError("INVALID_ARGUMENT", "The private key file must hold one 32-byte key as 64 hex characters.", { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  const participantId = options.account || "cli-user";
  const keyMaterial = Uint8Array.from(Buffer.from(privateKey, "hex"));
  privateKey = undefined;
  const request = {
    participantId,
    keyMaterial,
    inputIndexes: psktInputsToSign(session as any, participantId, options.inputs)
  };

  let newSession;
  try {
    newSession = await pskt.signSession(session, request);
  } finally {
    keyMaterial.fill(0);
  }
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

  // An output inside the artifact store goes through the store's gate (ARTIFACT-MUTATION-1)
  const inStore = ArtifactStoreMutation.forPath(outPath);
  if (inStore && inStore.relPath) {
    try {
      await inStore.store.writeFile(inStore.relPath, JSON.stringify(tx, null, 2) + "\n", { mode: 0o600 });
    } catch (err: any) {
      throw new HardkasCliError("SAVE_FAILED", `Failed to save extracted transaction: ${err.message}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
    }
    if (!options.json) {
      UI.success(`Transaction extracted to ${options.out}`);
    }
    return;
  }

  const tempPath = `${outPath}.tmp.${Date.now()}`;
  try {
    await fs.writeFile(tempPath, JSON.stringify(tx, null, 2) + "\n", { mode: 0o600, flag: "w" });
    await fs.rename(tempPath, outPath);
  } catch (err: any) {
    try { await fs.unlink(tempPath); } catch (_) {}
    throw new HardkasCliError("SAVE_FAILED", `Failed to save extracted transaction: ${err.message}`, { exitCode: HardkasExitCode.RUNTIME_FAILURE });
  }

  if (!options.json) {
    UI.success(`Transaction extracted to ${options.out}`);
  }
}
