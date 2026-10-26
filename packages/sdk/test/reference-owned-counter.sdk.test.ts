import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync, parseSilArtifactValuesJson } from "@hardkas/core";
import { silToV1Arg, v1ContractFactsFromArtifact } from "@hardkas/accounts";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { FakeNode } from "./helpers/fake-v1-node.js";
import { FIXTURE, FIXTURE_KEY, FIXTURE_XONLY, fundingUtxo } from "./helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · reference contract OwnedCounter (examples/09-silver-reference): a 1:1 auth-bound covenant whose policy
// checks the owner's signature (a signature slot of the covenant entry) and that the counter grows. Signed covenant
// transitions were refused by `silver covenant transition` before the engine; the engine plans and signs them, checks
// the signer against the key the contract holds before reading any key, and leaves to the node what the policy computes.
// The artifact is what the pinned silverc v1.0.0 writes for the fixture's constructor arguments (no compiler here).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const F = path.resolve(__dirname, "../../accounts/test/fixtures/v1-engine/reference");
const artifactBytes = fs.readFileSync(path.join(F, "owned-counter.artifact.json"));
const CTOR = parseSilArtifactValuesJson(fs.readFileSync(path.join(F, "owned-counter.constructor-args.json"), "utf8"));
const RECORD = { contentHash: "d".repeat(64), artifactSha256: createHash("sha256").update(artifactBytes).digest("hex") };
const OWNER_KEY = "33".repeat(32);
const MALLORY_KEY = "44".repeat(32);
const xonly = (key: string) => String(new (loadManagedKaspaWasmSync() as any).PrivateKey(key).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
const CONTRACT = { compileRecord: RECORD, contract: "OwnedCounter", constructorArgs: CTOR.map((v) => silToV1Arg(v)) } as any;
const BUMP = "__covenant_entrypoint_auth_bump";
const value = (v: number) => ({ value: { kind: "int", value: String(v) } }) as any;

describe("V1-ENGINE-2 · reference contract OwnedCounter: signed covenant transitions on the engine", () => {
  let ws: string;
  let node: FakeNode;
  const facts = {
    contract: async () =>
      v1ContractFactsFromArtifact({
        compileRecordHash: RECORD.contentHash,
        artifactSha256: RECORD.artifactSha256,
        artifact: JSON.parse(artifactBytes.toString("utf8")),
        contractName: "OwnedCounter",
        constructorArgs: CTOR,
        ast: JSON.parse(fs.readFileSync(path.join(F, "owned-counter.ast.json"), "utf8"))
      }),
    successor: async (): Promise<never> => {
      throw new Error("encoded states only");
    }
  };
  const reads: string[] = [];
  const keys = {
    publicKeyOf: (a: string) => (a === FIXTURE ? FIXTURE_XONLY : a === "owner" ? xonly(OWNER_KEY) : a === "mallory" ? xonly(MALLORY_KEY) : undefined),
    privateKeyOf: async (a: string) => {
      reads.push(a);
      return a === FIXTURE ? FIXTURE_KEY : a === "owner" ? OWNER_KEY : MALLORY_KEY;
    }
  };

  async function openSdk(): Promise<any> {
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (address: any) => node.listed(address) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockImplementation(async (o: any) => node.mempoolEntries(o.addresses) as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: node.networkId, virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockImplementation(async () => ({ networkId: node.networkId, serverVersion: "2.1.0", isSynced: true }) as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(sdk.rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    withClientUrl(sdk, LOOPBACK);
    return sdk;
  }

  /** The covenant started (value 10) and accepted. */
  async function started(sdk: any) {
    const g = await sdk.covenants.sign(await sdk.covenants.planGenesis({ contract: CONTRACT, outputs: [{ amountSompi: 1_000_000_000n }], funder: FIXTURE }, { facts }), { facts, keys });
    expect((await sdk.covenants.send(g.signed, { facts })).submitted).toBe(true);
    node.mine(g.txId);
    return { txId: g.txId, covenantId: JSON.parse(g.signed.signedTransaction.payload).outputs[0].covenant.covenantId as string };
  }
  const bump = (g: { txId: string; covenantId: string }, delta: number, signer: string, next: number) => ({
    covenantId: g.covenantId,
    inputs: [{ outpoint: { transactionId: g.txId, index: 0 }, contract: { ...CONTRACT, entry: BUMP, policy: "bump", args: [{ kind: "int", value: String(delta) }, { kind: "signer", signer }] }, computeBudget: "estimate" as const }],
    continuations: [{ amountSompi: "rest" as const, state: value(next) }]
  });

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ref-oc-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
    reads.length = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("RC-1 the owner signs the transition 10 → 15: one signature slot, its key the one the contract holds; the budget rusty-kaspa's estimate; accepted, and the lineage is verified holding 15", async () => {
    const sdk = await openSdk();
    const g = await started(sdk);
    const plan = await sdk.covenants.planTransition(bump(g, 5, "owner", 15), { facts });
    expect(plan.inputs[0].computeBudget).toBeGreaterThanOrEqual(10); // one signature check: 100,000 script units at least
    const t = await sdk.covenants.sign(plan, { facts, keys });
    expect(reads).toEqual([FIXTURE, "owner"]);
    expect((await sdk.covenants.send(t.signed, { facts })).submitted).toBe(true);
    node.mine(t.txId);
    const l = await sdk.covenants.lineage(g.covenantId, { facts });
    expect(l.verified).toBe(true);
    expect(l.tip[0]).toMatchObject({ outpoint: `${t.txId}:0`, node: "unspent", stateCheck: { status: "address-commits", state: value(15) } });
  });

  it("RC-2 another signer than the owner: SIGNER_SLOT_KEY_MISMATCH at the check (F1.4), before any private key is read; nothing sent", async () => {
    const sdk = await openSdk();
    const g = await started(sdk);
    reads.length = 0;
    const plan = await sdk.covenants.planTransition(bump(g, 5, "mallory", 15), { facts });
    await expect(sdk.covenants.sign(plan, { facts, keys })).rejects.toMatchObject({ code: "SIGNER_SLOT_KEY_MISMATCH" });
    expect(reads).toEqual([]);
    expect(node.submits).toEqual([g.txId]);
  });

  it("RC-3 a transition the policy refuses (delta 0) passes the local check — the engine does not run the policy — and is the node's final rejection: recorded, not retried, the covenant output still unspent", async () => {
    const sdk = await openSdk();
    const g = await started(sdk);
    const plan = await sdk.covenants.planTransition(bump(g, 0, "owner", 10), { facts });
    const t = await sdk.covenants.sign(plan, { facts, keys });
    node.rejectNext = "Rejected transaction $TX: failed to verify the signature script: script ran, but verification failed";
    const sent = await sdk.covenants.send(t.signed, { facts });
    expect(sent.submitted).toBe(false);
    expect(sent.rejection).toMatchObject({ code: "SCRIPT_POLICY_REJECTED", retriable: false });
    await expect(sdk.covenants.send(t.signed, { facts })).rejects.toMatchObject({ code: "TX_ALREADY_SUBMITTED" });
    expect(node.submits).toEqual([g.txId, t.txId]);
    const l = await sdk.covenants.lineage(g.covenantId, { facts });
    expect(l.rejected.map((r: any) => r.txId)).toEqual([t.txId]);
    expect(l.tip.map((r: any) => [r.outpoint, r.node])).toEqual([[`${g.txId}:0`, "unspent"]]);
  });
});
