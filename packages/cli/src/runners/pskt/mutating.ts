import fs from "node:fs/promises";
import path from "node:path";
import { UI } from "../../ui.js";
import { getOutput } from "../../output.js";
import { loadSession, saveSession } from "./fs.js";
import { HardkasCliError, HardkasExitCode } from "../../cli-errors.js";
import { pskt } from "@hardkas/sdk";
import { ArtifactStoreMutation } from "@hardkas/artifacts";
import { stripBom, assertMainnetTransactionsDisabled } from "@hardkas/core";

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

/** A HardkasError (code + message) of the SDK as the CLI's typed error, with the exit code its kind calls for. */
function asCliError(e: any): unknown {
  if (e instanceof HardkasCliError || typeof e?.code !== "string") return e;
  const policy = /^MAINNET_/.test(e.code) || e.code === "PSKT_NETWORK_MISMATCH";
  const usage = e.code === "PSKT_SIGNER_NETWORK_REQUIRED" || e.code === "NETWORK_ENDPOINT_INVALID";
  return new HardkasCliError(e.code, String(e.message ?? e).replace(new RegExp(`^${e.code}: `), ""), {
    exitCode: policy ? HardkasExitCode.POLICY_DENIED : usage ? HardkasExitCode.USAGE_ERROR : HardkasExitCode.RUNTIME_FAILURE
  });
}

export interface PsktSigner {
  /** The network name as the caller gave it (`--network` or the workspace's). */
  readonly name: string;
  /** The network that name declares (`networks[name].network`, else the name): what the session must say. */
  readonly networkId: string;
  /** The signer's node for that network, by the shared endpoint authority. */
  readonly rpcUrl: string;
}

/**
 * A1 (rc2 audit): the signer's OWN network and node, never the session file's label (a signature does not commit to a
 * network). The network is `--network`, else the workspace's (its execution default's, else `defaultNetwork`) when a
 * workspace config file exists; none is PSKT_SIGNER_NETWORK_REQUIRED. Mainnet is refused. Its node is the one the shared
 * endpoint authority gives (the declared `rpcUrl`, or a local network's default); a network without one (the simulator,
 * a public testnet that declares none) leaves the inputs unverified: PSKT_INPUTS_UNVERIFIED, nothing signed. Reads no key
 * and contacts nothing.
 */
export async function resolvePsktSigner(explicitNetwork: string | undefined): Promise<PsktSigner> {
  const { loadHardkasConfig, resolveNodeEndpoint } = await import("@hardkas/config");
  const { declaredNetworkIdOf, assertMainnetTransactionsDisabled } = await import("@hardkas/core");
  const loaded: { path?: string; config: any } = await loadHardkasConfig();
  const config = loaded.config ?? {};
  let name = typeof explicitNetwork === "string" && explicitNetwork.trim() !== "" ? explicitNetwork.trim() : undefined;
  let simulatorTarget = false;
  if (!name && loaded.path) {
    const exec = config.execution;
    const target = exec?.default ? exec.targets?.[exec.default] : undefined;
    name = typeof target?.network === "string" ? target.network : typeof config.defaultNetwork === "string" ? config.defaultNetwork : undefined;
    simulatorTarget = target?.mode === "simulator";
  }
  if (!name) {
    throw new HardkasCliError(
      "PSKT_SIGNER_NETWORK_REQUIRED",
      "Name the network you sign for with --network, or run in a workspace whose config names one. A PSKT is never signed for the network the session file declares (a signature does not commit to a network). Nothing was signed.",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  const networkId = declaredNetworkIdOf(config, name) ?? name;
  try {
    assertMainnetTransactionsDisabled("sign", [name, networkId], "pskt sign");
  } catch (e) {
    throw asCliError(e);
  }
  const entry = config.networks?.[name];
  if (networkId === "simulated" || entry?.kind === "simulated" || simulatorTarget) {
    throw new HardkasCliError(
      "PSKT_INPUTS_UNVERIFIED",
      `Network '${name}' is the HardKAS simulator: it has no node that could list the inputs to be signed, and a PSKT is signed only on inputs the signer's own node lists as unspent. Use --network with a node network (simnet, testnet-10, …). Nothing was signed.`,
      { exitCode: HardkasExitCode.RUNTIME_FAILURE }
    );
  }
  try {
    return { name, networkId, rpcUrl: resolveNodeEndpoint({ config, networkId: name }).url };
  } catch (e: any) {
    if (e?.code === "NETWORK_ENDPOINT_REQUIRED") {
      throw new HardkasCliError(
        "PSKT_INPUTS_UNVERIFIED",
        `No node is configured for '${name}', so the inputs to be signed cannot be checked on it, and a PSKT is signed only on inputs the signer's own node lists as unspent. Declare networks['${name}'].rpcUrl in hardkas.config.ts. Nothing was signed.`,
        { exitCode: HardkasExitCode.RUNTIME_FAILURE }
      );
    }
    throw asCliError(e);
  }
}

export async function runPsktSign(sessionPath: string, options: { account?: string, keystore?: string, keyStdin?: boolean, privateKeyFile?: string, inputs?: string, network?: string, out: string, force: boolean, json: boolean }) {
  if (options.json) UI.setJsonMode(true);

  let privateKey: string | undefined;

  if (options.privateKeyFile) {
    if (process.env.NODE_ENV !== "test") {
      UI.warning("--private-key-file is intended for TEST ONLY.");
    }
    // A1: the key file is read only after the signer's network and node have accepted the session (below)
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
  // HK-13: no PSKT signature on mainnet, first of all (MAINNET_SIGNING_DISABLED)
  try {
    assertMainnetTransactionsDisabled("sign", [session.networkId], "pskt sign");
  } catch (e) {
    throw asCliError(e);
  }
  // A1: the signer's own network (never the session's label) and its node; the session must be for that network and
  // the node must list every input to be signed as unspent, all before the key file is read. Resolved before the inputs
  // are read, so a mainnet signer network is refused first, whatever `--inputs` says (re-audit F4).
  const signer = await resolvePsktSigner(options.network);
  const participantId = options.account || "cli-user";
  const inputIndexes = psktInputsToSign(session as any, participantId, options.inputs);
  const { JsonWrpcKaspaClient } = await import("@hardkas/kaspa-rpc");
  const node = new JsonWrpcKaspaClient({ rpcUrl: signer.rpcUrl, expectedNetworkId: signer.networkId });
  const context = { networkId: signer.networkId, node };
  let keyMaterial: Uint8Array | undefined;
  let newSession;
  try {
    try {
      await pskt.assertSessionSignable(session, inputIndexes, context);
    } catch (e) {
      throw asCliError(e);
    }

    privateKey = (await fs.readFile(path.resolve(options.privateKeyFile!), "utf8")).trim();
    // TX-09: the adapters read `keyMaterial` (bytes) and refuse an empty `inputIndexes`; this used to pass `privateKey`
    // (a field no adapter reads) and `inputIndexes: []`, so `hardkas pskt sign` could never sign
    if (!privateKey || !/^[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new HardkasCliError("INVALID_ARGUMENT", "The private key file must hold one 32-byte key as 64 hex characters.", { exitCode: HardkasExitCode.USAGE_ERROR });
    }
    keyMaterial = Uint8Array.from(Buffer.from(privateKey, "hex"));
    privateKey = undefined;
    const request = { participantId, keyMaterial, inputIndexes };
    try {
      newSession = await pskt.signSession(session, request, context);
    } catch (e) {
      throw asCliError(e);
    }
  } finally {
    keyMaterial?.fill(0);
    privateKey = undefined;
    await node.close();
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
