import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload } from "./helpers/official-signed-payload.js";
import { KaspaWrpcClient, RpcRequestNotSentError, RpcSubmitOutcomeUnknownError } from "@hardkas/kaspa-rpc";
import { fakeOfficialRpc } from "../../kaspa-rpc/test/helpers/fake-official-rpc.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  submitOutcomeOf,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// EXPECTED-TXID-1 (owner brief 2026-10-19) at the SDK send boundary. sdk.tx.send hands the RPC client the signed
// payload — JSON text that carries no id — so before this lot the client could not tell which transaction the node's
// answer named, and the SDK took whatever id the answer gave (or none) as the transaction that was sent. Now:
//  - the signed artifact's TXID is checked, before any request, against the id the official kaspa-wasm computes for the
//    payload being sent; an artifact whose TXID is absent or is not its payload's is refused (nothing sent or recorded);
//  - that TXID is handed to the client (`expectedTxId`), and an answer that names no transaction or another one is an
//    UNKNOWN outcome recorded under the expected TXID — never accepted. An RPC answer is never a consensus confirmation.
// Same hermetic setup as wave2-d-send-fee: a real simnet plan (upstream Generator over scripted UTXOs), a signed
// artifact re-issued from it with an RPC-transaction payload, every client call a stand-in.

const LOOPBACK = "http://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];
const OTHER_ID = "ef".repeat(32);

/** The RPC transaction the plan authorizes, as a signer writes it, with its official id. */
function officialFromPlan(plan: any): { payload: string; txId: string } {
  return officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ]
  });
}

/** A signed artifact re-issued from `plan` (sealed, verifiable) carrying `payload` and declaring `txId`. */
function signedFromPlan(plan: any, payload: string, txId: string): any {
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-10-19T00:00:00.000Z",
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    execution: plan.execution,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId,
    signedTransaction: { format: "hex", payload },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

async function outcome(p: Promise<unknown>) {
  try {
    return { result: (await p) as any, error: undefined as any };
  } catch (error: any) {
    return { result: undefined as any, error };
  }
}

describe("EXPECTED-TXID-1 · sdk.tx.send sends under the signed artifact's TXID and checks the node's answer against it", () => {
  let ws: string;
  let sdk: Hardkas;
  let submit: ReturnType<typeof vi.spyOn>;
  let plan: any;
  let official: { payload: string; txId: string };

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-expected-txid-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" } as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction");
    withClientUrl(sdk, LOOPBACK);
    plan = await sdk.tx.plan({
      from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
      to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
      amount: "3",
      feeRate: 1000n
    });
    await sdk.artifacts.write(plan);
    official = officialFromPlan(plan);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const submissions = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)) : [];
  };
  const sendWith = async (answer: () => Promise<unknown>, signed = signedFromPlan(plan, official.payload, official.txId)) => {
    submit.mockImplementation(answer as any);
    await sdk.artifacts.write(signed);
    return outcome(sdk.tx.send(signed, LOOPBACK));
  };

  it("the client is handed the signed artifact's TXID (expectedTxId) with the payload", async () => {
    const r = await sendWith(async () => ({ transactionId: official.txId }));
    expect(r.error).toBeUndefined();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![1]).toMatchObject({ expectedTxId: official.txId });
  });

  it("the node names the same TXID → accepted, recorded under it", async () => {
    const r = await sendWith(async () => ({ transactionId: official.txId }));
    expect(r.result.submitted).toBe(true);
    expect(r.result.txId).toBe(official.txId);
    expect(submitOutcomeOf(r.result.submission.submitResult)).toBe("accepted");
  });

  it("the node names ANOTHER TXID → unknown (never accepted), recorded under the expected TXID", async () => {
    const r = await sendWith(async () => ({ transactionId: OTHER_ID }));
    expect(r.error).toBeUndefined();
    expect(r.result.submitted).toBe(false);
    expect(r.result.txId).toBe(official.txId);
    expect(submitOutcomeOf(r.result.submission.submitResult)).toBe("unknown");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("an empty answer → unknown, recorded under the expected TXID", async () => {
    const r = await sendWith(async () => ({}));
    expect(r.result.submitted).toBe(false);
    expect(r.result.txId).toBe(official.txId);
    expect(submitOutcomeOf(r.result.submission.submitResult)).toBe("unknown");
  });

  it("a timeout after the request left → unknown, recorded under the expected TXID, sent once", async () => {
    const r = await sendWith(async () => {
      throw new RpcSubmitOutcomeUnknownError({ txId: official.txId, cause: new Error("RPC request submitTransaction timed out after 5000ms") });
    });
    expect(r.result.submitted).toBe(false);
    expect(r.result.txId).toBe(official.txId);
    expect(submitOutcomeOf(r.result.submission.submitResult)).toBe("unknown");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("a signed artifact whose TXID is not its payload's official id → SIGNED_TXID_MISMATCH, nothing sent or recorded", async () => {
    const r = await sendWith(async () => ({ transactionId: OTHER_ID }), signedFromPlan(plan, official.payload, OTHER_ID));
    expect(r.error?.code).toBe("SIGNED_TXID_MISMATCH");
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });

  it("a payload whose official id cannot be computed → SIGNED_TXID_UNVERIFIABLE, nothing sent or recorded", async () => {
    const r = await sendWith(async () => ({ transactionId: official.txId }), signedFromPlan(plan, "deadbeef", official.txId));
    expect(r.error?.code).toBe("SIGNED_TXID_UNVERIFIABLE");
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });

  it("control: a proven failure before emitting stays SUBMIT_NOT_SENT, nothing recorded", async () => {
    const r = await sendWith(async () => {
      throw new RpcRequestNotSentError("submitTransaction was not sent (before the transport): no connection");
    });
    expect(r.error?.code).toBe("SUBMIT_NOT_SENT");
    expect(submissions()).toEqual([]);
  });

  it("through the CLI's client (KaspaWrpcClient): the node is asked with allowOrphan false, and another TXID is unknown", async () => {
    const received: any[] = [];
    const rpc = fakeOfficialRpc({
      getServerInfo: () => ({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true }),
      getBlockDagInfo: () => ({ network: "simnet", virtualDaaScore: 1_000_000, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" }),
      getSinkBlueScore: () => ({ blueScore: 5000 }),
      submitTransaction: (req: any) => {
        received.push(req);
        return { transactionId: OTHER_ID };
      }
    });
    const wsUrl = "ws://127.0.0.1:17110";
    const client = new KaspaWrpcClient(wsUrl, { rpcFactory: rpc.factory, expectedNetworkId: "simnet" } as any);
    await client.connect();
    (sdk as any).rpc = client;
    const signed = signedFromPlan(plan, official.payload, official.txId);
    await sdk.artifacts.write(signed);
    const r = await outcome(sdk.tx.send(signed, wsUrl));
    await client.disconnect();
    expect(r.error).toBeUndefined();
    expect(received).toHaveLength(1);
    expect(received[0].allowOrphan).toBe(false);
    expect(r.result.submitted).toBe(false);
    expect(r.result.txId).toBe(official.txId);
    expect(submitOutcomeOf(r.result.submission.submitResult)).toBe("unknown");
  });
});
