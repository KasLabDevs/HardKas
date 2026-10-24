import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayloadForPlan, nodeNamesReceived } from "./helpers/official-signed-payload.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  finalizeTxPlanIdentity,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

// TX-FEE-GUARD-1 (owner GO 2026-10-20; defects found by TESTNET-READONLY-1 phase 5, NEG-01 and P5-2/P5-3).
//   - A fee RATE (sompi per gram of mass) must be a positive integer: 0, negatives, decimals and text are refused with
//     INVALID_FEE_RATE (they used to be accepted in silence, or fail as an untyped error).
//   - A TOTAL fee limit (sompi) can be set per plan (`maxFeeSompi`, recorded and authenticated in the plan) and per
//     network in the workspace config (`networks[<net>].maxFeeSompi`, a workspace policy re-read at every stage). A fee
//     above the lower of the two is refused with FEE_EXCEEDS_MAX when planning, again before signing (on the fee the
//     plan really pays: inputs - outputs - change, so a plan built by another route cannot understate it) and again
//     before sending (on the fee DERIVED from the signed transaction). With a limit in force and no way to derive the
//     signed fee, the send is refused (FEE_LIMIT_UNVERIFIABLE). No limit is imposed when none is set (compatibility).
// Same hermetic setup as wave2-d-send-fee: a real-network simnet plan from the upstream Generator over a scripted node;
// every client call is a stand-in. Nothing is signed with a key and nothing is sent to a node.

const LOOPBACK = "http://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];
const ext = (address: string) => ({ name: address, kind: "external-wallet", network: "simnet", address }) as any;

/** A signed artifact re-issued from `plan` whose payload is the RPC transaction the plan authorizes (or `payload`). */
function signedFromPlan(plan: any, payload?: string): any {
  // TN10-CLI-E2E (EXPECTED-TXID-1 integration, fixture only): a send now refuses a signed artifact whose txId is not
  // the official kaspa-wasm id of its payload (SIGNED_TXID_*), so without an explicit payload the artifact carries the
  // transaction the plan authorizes under its official id (EXPECTED-TXID-1's own helper). An explicit opaque payload
  // keeps the placeholder id: those sends must be refused earlier (FEE_LIMIT_UNVERIFIABLE). Assertions unchanged.
  const official = payload === undefined ? officialSignedPayloadForPlan(plan) : undefined;
  const body = payload ?? official!.payload;
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-10-20T00:00:00.000Z",
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    execution: plan.execution,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId: official?.txId ?? "f".repeat(64),
    signedTransaction: { format: "hex", payload: body },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("TX-FEE-GUARD-1 · fee rate validity and a total fee limit at plan, sign and send", () => {
  let ws: string;
  let sdk: Hardkas;
  let submit: ReturnType<typeof vi.spyOn>;
  const cfg = () => sdk.config.config as any;
  const setNetworkMaxFee = (v: unknown) => {
    cfg().networks.simnet = { ...cfg().networks.simnet, maxFeeSompi: v };
  };
  const planWith = (extra: Record<string, unknown> = {}) =>
    sdk.tx.plan({ from: ext(FROM), to: ext(TO), amount: "3", feeRate: 1000n, ...extra } as any);

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-feeguard-sdk-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    cfg().networks = { ...(cfg().networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" } as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    // EXPECTED-TXID-1 integration (fixture only): the stand-in node names the transaction it is handed, as a node does
    submit = vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation((async (tx: unknown) => nodeNamesReceived(tx)) as any);
    withClientUrl(sdk, LOOPBACK);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("control: without any limit the plan and the send behave as before (compatibility)", async () => {
    const plan: any = await planWith();
    expect(plan.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(plan.maxFeeSompi).toBeUndefined();
    await sdk.artifacts.write(plan);
    expect(await codeOf(sdk.tx.send(signedFromPlan(plan), LOOPBACK))).toBe("OK");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("a fee rate of 0 or a negative one is refused with INVALID_FEE_RATE (it used to plan in silence)", async () => {
    expect(await codeOf(planWith({ feeRate: 0n }))).toBe("INVALID_FEE_RATE");
    expect(await codeOf(planWith({ feeRate: -5n }))).toBe("INVALID_FEE_RATE");
  });

  it("a plan limit below the fee is refused with FEE_EXCEEDS_MAX; equal to it, the plan records the limit inside its identity", async () => {
    const free: any = await planWith();
    const fee = BigInt(free.estimatedFeeSompi);
    expect(await codeOf(planWith({ maxFeeSompi: fee - 1n }))).toBe("FEE_EXCEEDS_MAX");
    const capped: any = await planWith({ maxFeeSompi: fee });
    expect(capped.maxFeeSompi).toBe(fee.toString());
    expect(calculateContentHash({ ...capped, maxFeeSompi: (fee * 10n).toString() }, CURRENT_HASH_VERSION)).not.toBe(capped.contentHash);
  });

  it("a negative, zero or non-integer plan limit is refused (INVALID_MAX_FEE)", async () => {
    expect(await codeOf(planWith({ maxFeeSompi: 0n }))).toBe("INVALID_MAX_FEE");
    expect(await codeOf(planWith({ maxFeeSompi: "1.5" }))).toBe("INVALID_MAX_FEE");
  });

  it("the workspace's network limit (networks.simnet.maxFeeSompi) refuses a plan above it", async () => {
    const fee = BigInt(((await planWith()) as any).estimatedFeeSompi);
    setNetworkMaxFee((fee - 1n).toString());
    expect(await codeOf(planWith())).toBe("FEE_EXCEEDS_MAX");
  });

  it("sign: a plan above the network limit is refused BEFORE any signer is asked", async () => {
    const plan: any = await planWith();
    setNetworkMaxFee((BigInt(plan.estimatedFeeSompi) - 1n).toString());
    expect(await codeOf(sdk.tx.sign(plan, "alice"))).toBe("FEE_EXCEEDS_MAX");
  });

  it("sign: a plan built by another route that understates its fee (re-sealed, change 7 sompi lower) is refused on the fee it really pays", async () => {
    const fee = BigInt(((await planWith()) as any).estimatedFeeSompi);
    const capped: any = await planWith({ maxFeeSompi: fee });
    const forged: any = structuredClone(capped);
    forged.change.amountSompi = (BigInt(forged.change.amountSompi) - 7n).toString();
    finalizeTxPlanIdentity(forged);
    expect(forged.estimatedFeeSompi).toBe(fee.toString()); // the declared fee still looks within the limit
    expect(await codeOf(sdk.tx.sign(forged, "alice"))).toBe("FEE_EXCEEDS_MAX");
  });

  it("send: a signed transaction whose derived fee is above the network limit is refused; nothing reaches the node", async () => {
    const plan: any = await planWith();
    await sdk.artifacts.write(plan);
    setNetworkMaxFee((BigInt(plan.estimatedFeeSompi) - 1n).toString());
    expect(await codeOf(sdk.tx.send(signedFromPlan(plan), LOOPBACK))).toBe("FEE_EXCEEDS_MAX");
    expect(submit).not.toHaveBeenCalled();
  });

  it("send: with a limit in force and a signed fee that cannot be derived, the send is refused (FEE_LIMIT_UNVERIFIABLE)", async () => {
    const plan: any = await planWith();
    await sdk.artifacts.write(plan);
    setNetworkMaxFee((BigInt(plan.estimatedFeeSompi) * 10n).toString());
    expect(await codeOf(sdk.tx.send(signedFromPlan(plan, "deadbeef"), LOOPBACK))).toBe("FEE_LIMIT_UNVERIFIABLE");
    expect(submit).not.toHaveBeenCalled();
  });

  it("send: the plan's own limit is enforced on the signed fee too (control: within it, the send proceeds once)", async () => {
    const fee = BigInt(((await planWith()) as any).estimatedFeeSompi);
    const capped: any = await planWith({ maxFeeSompi: fee });
    await sdk.artifacts.write(capped);
    expect(await codeOf(sdk.tx.send(signedFromPlan(capped), LOOPBACK))).toBe("OK");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
