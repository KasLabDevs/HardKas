import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../src/index.js";
import { assertAllowUnsyncedOption, checkSendNodeSynced, unsyncedSendAllowedOn } from "../src/send-node-sync.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload } from "./helpers/official-signed-payload.js";
import { isNodeSyncError, NodeSyncError, RpcConnectionError } from "@hardkas/kaspa-rpc";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// RC1 · D3 · the SDK's tx.send requires a node that says it is synced, as the CLI does (INT9-A I-3b). Before: the SDK
// sent to whatever node its client reached, synced or not (only the CLI's own client refused one at connection), and
// rusty-kaspad v2.1.0 itself ACCEPTS a submitTransaction while it says `isSynced: false` (probed on a real node, R1
// evidence 01). Now, before any read the send depends on and before anything is sent or recorded, the node is asked
// (getServerInfo); only `isSynced: true` lets the send go on. Anything else — false, absent, not a boolean, a client
// with no getServerInfo, a failed read that is not an RPC failure — is NODE_NOT_SYNCED (a NodeSyncError). The one
// exception is explicit and local: `allowUnsyncedNode: true` on a simnet or devnet instance; refused on any other
// network (SEND_UNSYNCED_NODE_NOT_ALLOWED) and never implied. Mainnet broadcast stays disabled whatever it says.
// Hermetic: a real simnet plan (upstream Generator over scripted UTXOs), every client call a stand-in that may lie.
// -----------------------------------------------------------------------------

const LOOPBACK = "ws://127.0.0.1:16110";
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];

function officialFromPlan(plan: any): { payload: string; txId: string } {
  return officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ]
  });
}

function signedFromPlan(plan: any, payload: string, txId: string): any {
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
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

describe("RC1 · D3 · sdk.tx.send broadcasts only to a node that says it is synced", () => {
  let ws: string;
  let sdk: Hardkas;
  let submit: ReturnType<typeof vi.spyOn>;
  let serverInfo: ReturnType<typeof vi.spyOn>;
  let reads: string[];
  let signed: any;
  let txId: string;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-d3-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    reads = [];
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => (reads.push("getUtxosByAddress"), UTXOS.map((u) => ({ ...u })) as any));
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async () => (reads.push("getMempoolEntriesByAddresses"), { entries: [] }) as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(
      async () => (reads.push("getBlockDagInfo"), { networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" }) as any
    );
    serverInfo = vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction");
    withClientUrl(sdk, LOOPBACK);
    const plan: any = await sdk.tx.plan({
      from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
      to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
      amount: "3",
      feeRate: 1000n
    });
    await sdk.artifacts.write(plan);
    const official = officialFromPlan(plan);
    txId = official.txId;
    signed = signedFromPlan(plan, official.payload, official.txId);
    await sdk.artifacts.write(signed);
    submit.mockImplementation((async () => ({ transactionId: official.txId })) as any);
    reads = [];
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const submissions = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)) : [];
  };
  const refusedUnsynced = (r: { error: any; result: any }, isSynced: boolean | undefined) => {
    expect(r.result, "nothing returned").toBeUndefined();
    expect(r.error?.code).toBe("NODE_NOT_SYNCED");
    expect(r.error).toBeInstanceOf(NodeSyncError);
    expect(isNodeSyncError(r.error)).toBe(true);
    expect(r.error.sync).toMatchObject({ expected: "simnet", isSynced });
    expect(String(r.error.message)).toMatch(/Nothing was sent or recorded/);
    expect(submit, "no submitTransaction").not.toHaveBeenCalled();
    expect(submissions(), "no submission recorded").toEqual([]);
    // asked first: no read the send depends on (submit point, the node check) went to that node
    expect(reads, "nothing else read from it").toEqual([]);
  };

  it("D3-1 the node says isSynced: false → NODE_NOT_SYNCED, nothing read, sent or recorded (it used to be sent)", async () => {
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: false } as any);
    refusedUnsynced(await outcome(sdk.tx.send(signed, LOOPBACK)), false);
  });

  it("D3-2 the node says nothing about sync (no isSynced, a non-boolean, a client with no getServerInfo, a failed read) → NODE_NOT_SYNCED", async () => {
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0" } as any);
    refusedUnsynced(await outcome(sdk.tx.send(signed, LOOPBACK)), undefined);
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: "true" } as any);
    refusedUnsynced(await outcome(sdk.tx.send(signed, LOOPBACK)), undefined);
    serverInfo.mockRejectedValue(new Error("method getServerInfo is not implemented by this node"));
    const failed = await outcome(sdk.tx.send(signed, LOOPBACK));
    refusedUnsynced(failed, undefined);
    expect(String(failed.error.message)).toMatch(/not implemented by this node/);
  });

  it("D3-3 a connection failure while asking stays what it is (RPC_CONNECTION_FAILED), and nothing is sent", async () => {
    serverInfo.mockRejectedValue(new RpcConnectionError("Cannot connect to Kaspa RPC at ws://127.0.0.1:16110"));
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error?.code).toBe("RPC_CONNECTION_FAILED");
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });

  it("D3-4 control · the node says isSynced: true → one submitTransaction, recorded, as before", async () => {
    const r = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(r.error).toBeUndefined();
    expect(r.result.submitted).toBe(true);
    expect(r.result.txId).toBe(txId);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submissions().length).toBe(1);
  });

  it("D3-5 a node that says it is synced at the check but not at the broadcast identity check: the decision is the check's (asked once, before anything)", async () => {
    // the check reads getServerInfo first; the broadcast identity check reads it again right before the submit
    serverInfo.mockResolvedValueOnce({ networkId: "simnet", serverVersion: "2.1.0", isSynced: false } as any);
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    refusedUnsynced(await outcome(sdk.tx.send(signed, LOOPBACK)), false);
  });

  it("D3-6 allowUnsyncedNode: true on a simnet instance → sent to the unsynced node (explicit, local)", async () => {
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: false } as any);
    const r = await outcome(sdk.tx.send(signed, { url: LOOPBACK, allowUnsyncedNode: true }));
    expect(r.error).toBeUndefined();
    expect(r.result.submitted).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("D3-7 allowUnsyncedNode is a boolean: anything else is SEND_OPTION_INVALID before any request", async () => {
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: false } as any);
    const r = await outcome(sdk.tx.send(signed, { url: LOOPBACK, allowUnsyncedNode: "yes" as any }));
    expect(r.error?.code).toBe("SEND_OPTION_INVALID");
    expect(serverInfo).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("D3-8 the escape is never implied: allowUnplannedSignedTransaction or preflight do not lift the rule", async () => {
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: false } as any);
    refusedUnsynced(await outcome(sdk.tx.send(signed, { url: LOOPBACK, allowUnplannedSignedTransaction: true })), false);
    refusedUnsynced(await outcome(sdk.tx.send(signed, { url: LOOPBACK, preflight: true })), false);
  });

  it("D3-9 covenants.send and a re-send of a recorded submission go through the same rule", async () => {
    const first = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(first.result?.submitted).toBe(true);
    submit.mockClear();
    serverInfo.mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: false } as any);
    // the re-send would only observe the node: an unsynced node's view is not used for that either
    const again = await outcome(sdk.tx.send(signed, LOOPBACK));
    expect(again.error?.code).toBe("NODE_NOT_SYNCED");
    const viaCovenants = await outcome(sdk.covenants.send(signed, { url: LOOPBACK }));
    expect(viaCovenants.error?.code).toBe("NODE_NOT_SYNCED");
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("RC1 · D3 · the explicit escape is for a controlled local network only", () => {
  it("allowed on simnet (its aliases) and devnet; refused on testnet, mainnet and an unnamed network", () => {
    for (const n of ["simnet", "simulated", "local-docker-simnet", "devnet", "kaspa-devnet"]) expect(unsyncedSendAllowedOn(n), n).toBe(true);
    for (const n of ["testnet-10", "testnet-11", "mainnet", "kaspa", "prod", "", undefined]) expect(unsyncedSendAllowedOn(n as any), String(n)).toBe(false);
    expect(assertAllowUnsyncedOption(undefined, "testnet-10")).toBe(false);
    expect(assertAllowUnsyncedOption(false, "testnet-10")).toBe(false);
    expect(assertAllowUnsyncedOption(true, "devnet")).toBe(true);
    for (const n of ["testnet-10", "mainnet", "prod"]) {
      let code: string | undefined;
      try {
        assertAllowUnsyncedOption(true, n);
      } catch (e: any) {
        code = e?.code;
      }
      expect(code, n).toBe("SEND_UNSYNCED_NODE_NOT_ALLOWED");
    }
  });

  it("the check itself: only isSynced === true passes; the escape lets an unsynced node through and says so", async () => {
    const node = (info: unknown) => ({ getServerInfo: async () => info });
    await expect(checkSendNodeSynced(node({ isSynced: true }), { endpoint: "ws://u:p@127.0.0.1:1", network: "testnet-10", allowUnsynced: false })).resolves.toEqual({ isSynced: true, allowedUnsynced: false });
    await expect(checkSendNodeSynced(node({ isSynced: false }), { endpoint: undefined, network: "devnet", allowUnsynced: true })).resolves.toEqual({ isSynced: false, allowedUnsynced: true });
    const refused = await checkSendNodeSynced(node({ isSynced: false }), { endpoint: "ws://user:secret@127.0.0.1:1", network: "testnet-10", allowUnsynced: false }).catch((e) => e);
    expect(refused.code).toBe("NODE_NOT_SYNCED");
    expect(String(refused.message)).not.toContain("secret");
    const noMethod = await checkSendNodeSynced({}, { endpoint: undefined, network: "simnet", allowUnsynced: false }).catch((e) => e);
    expect(noMethod.code).toBe("NODE_NOT_SYNCED");
  });

  it("mainnet: allowUnsyncedNode changes nothing — the broadcast is refused by the mainnet guard first, nothing asked", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rc1-d3-mainnet-"));
    try {
      fs.mkdirSync(path.join(ws, ".hardkas"));
      const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
      const serverInfo = vi.spyOn(sdk.rpc, "getServerInfo");
      const submit = vi.spyOn(sdk.rpc, "submitTransaction");
      const r = await outcome(sdk.tx.send({ networkId: "mainnet", txId: "c".repeat(64) } as any, { allowUnsyncedNode: true }));
      expect(String(r.error?.code)).toMatch(/^MAINNET_/);
      expect(serverInfo).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
