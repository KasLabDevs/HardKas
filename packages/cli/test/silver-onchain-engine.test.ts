import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HardkasError, getNetworkPrefix, loadManagedKaspaWasmSync } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";
import { v1ContractFactsAtState } from "@hardkas/accounts";
import {
  openCanonicalSilverSdk,
  sendSilverEngineTransaction,
  silverEngineDeploy,
  silverEngineGenesis,
  silverEngineKeys,
  silverEngineSpend,
  silverEngineTransition
} from "../src/runners/silver-onchain-runner.js";
import { Command } from "commander";
import { registerSilverCommand } from "../src/commands/silver.js";
import { createCommandOutput, setGlobalOutput } from "../src/output.js";
import { noteParsedWorkspace } from "../src/workspace-root.js";
import { FakeNode } from "../../sdk/test/helpers/fake-v1-node.js";
import {
  COUNTER_ADDR,
  COUNTER_RECORD,
  COVENANT_ID,
  FIXTURE,
  FIXTURE_KEY,
  SUCCESSOR_ADDR,
  TWO_KEYS,
  TWO_RECORD,
  fundingUtxo,
  twoOfTwoCompileRecord,
  twoOfTwoFacts,
  v1CorpusFacts
} from "../../sdk/test/helpers/v1-corpus.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · `hardkas silver deploy | spend | covenant genesis | covenant transition` on the SDK's v1 engine. The
// commands' runner plans, signs and sends with sdk.covenants (F1.4 before any key, F1.6 the one send) against the
// canonical node's client, and keeps the commands' codes: the node's refusal is SILVER_REJECTED_BY_NODE and is final,
// an uncertain outcome is SILVER_SUBMIT_OUTCOME_UNKNOWN and is never re-sent, a request that never left is
// SILVER_SUBMIT_NOT_SENT. Against the stand-in node of the SDK tests, with the corpus Counter and the TwoOfTwo fixture
// (silverc artifacts, no compiler).
// -----------------------------------------------------------------------------

const LOOPBACK = "http://127.0.0.1:16110";
const TX = "ab".repeat(32);
const COUNTER = { compileRecord: COUNTER_RECORD, contract: "Counter", constructorArgs: [{ kind: "int", value: "7" }] } as any;
const FIXTURE_ACCOUNT = { names: ["fixture"], privateKey: FIXTURE_KEY, address: FIXTURE };
const codeOf = async (p: Promise<unknown>) => p.then(() => "RESOLVED", (e: any) => e?.code ?? `UNCODED ${e?.message}`);
const addressOf = (lock: { version: number; script: string }) => {
  const k: any = loadManagedKaspaWasmSync();
  return String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(lock.version, lock.script), "simnet"));
};
const accountOf = (name: string) => {
  const k: any = loadManagedKaspaWasmSync();
  return { names: [name], privateKey: TWO_KEYS[name]!, address: new k.PrivateKey(TWO_KEYS[name]!).toKeypair().toAddress(getNetworkPrefix("simnet")).toString() };
};

describe("V1-ENGINE-2 · the silver commands' runner = the SDK's v1 engine", () => {
  let ws: string;
  let node: FakeNode;

  /** The canonical node's client, its calls answered by the stand-in node. */
  function canonicalRpc(): any {
    const rpc: any = new JsonWrpcKaspaClient({ rpcUrl: LOOPBACK });
    Object.defineProperty(rpc, "url", { value: LOOPBACK, configurable: true, writable: true });
    vi.spyOn(rpc, "getUtxosByAddress").mockImplementation(async (address: any) => node.listed(address) as any);
    vi.spyOn(rpc, "getMempoolEntriesByAddresses").mockImplementation(async (o: any) => node.mempoolEntries(o.addresses) as any);
    vi.spyOn(rpc, "getBlockDagInfo").mockImplementation(async () => ({ networkId: node.networkId, virtualDaaScore: node.virtualDaaScore, tipHashes: [node.sink], virtualParentHashes: [node.sink], sink: node.sink }) as any);
    vi.spyOn(rpc, "getServerInfo").mockImplementation(async () => ({ networkId: node.networkId, serverVersion: "2.1.0", isSynced: true }) as any);
    vi.spyOn(rpc, "getSinkBlueScore").mockImplementation(async () => ({ blueScore: node.sinkBlueScore.toString() }) as any);
    vi.spyOn(rpc, "call").mockImplementation(async (method: string, params: any) => node.call(method, params));
    vi.spyOn(rpc, "submitTransaction").mockImplementation(async (transaction: any) => node.submit(transaction));
    return rpc;
  }

  async function context(accounts: any[], o: { facts?: any; records?: any[] } = {}) {
    const sdk = await openCanonicalSilverSdk(ws, canonicalRpc());
    return { sdk, facts: o.facts ?? v1CorpusFacts(), compileRecords: o.records ?? [], keys: silverEngineKeys(accounts) };
  }

  /** A covenant of the corpus Counter (state 7), started by the runner and accepted. */
  async function counterCovenant(ctx: any) {
    const g = await silverEngineGenesis(ctx, { contract: COUNTER, address: COUNTER_ADDR, valueSompi: 1_000_000_000n, funder: FIXTURE });
    node.mine(g.txId);
    return g;
  }
  const bumpTo = (g: { txId: string }, value: bigint, delta: bigint) => {
    const at = v1ContractFactsAtState(cachedCounter!, { value: { kind: "int", value } });
    return {
      contract: COUNTER,
      covenantId: COVENANT_ID,
      outpoint: { transactionId: g.txId, index: 0 },
      policy: "bump",
      entry: "__covenant_entrypoint_auth_bump",
      args: [{ kind: "int", value: String(delta) }] as any,
      nextState: { value: { kind: "int", value: String(value) } } as any,
      expectedSuccessorAddress: addressOf(at.lock)
    };
  };
  let cachedCounter: any;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-v1e2-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    node = new FakeNode();
    node.utxos = [fundingUtxo()];
    cachedCounter ??= await v1CorpusFacts().contract();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("SE-1 the send's outcome in the commands' codes: accepted (or held by the node) → the txId; the node's refusal → SILVER_REJECTED_BY_NODE; anything uncertain → SILVER_SUBMIT_OUTCOME_UNKNOWN naming the txId; never sent → SILVER_SUBMIT_NOT_SENT; a refusal before the broadcast keeps its code", async () => {
    let sends = 0;
    const sdkAnswering = (answer: () => unknown) => ({ covenants: { send: async () => { sends++; return answer(); } } }) as any;
    const run = (answer: () => unknown) => sendSilverEngineTransaction(sdkAnswering(answer), { txId: TX }, "covenant transition");
    expect(await run(() => ({ submitted: true, txId: TX }))).toBe(TX);
    expect(await run(() => ({ submitted: false, alreadySubmitted: true, txId: TX }))).toBe(TX);
    const rejected = run(() => ({
      submitted: false,
      txId: TX,
      submission: { submitResult: { accepted: false, error: `Rejected transaction ${TX}: failed to verify the signature script: script ran, but verification failed` } },
      rejection: { code: "SCRIPT_POLICY_REJECTED", retriable: false }
    }));
    await expect(rejected).rejects.toMatchObject({ code: "SILVER_REJECTED_BY_NODE", message: expect.stringContaining("SCRIPT_POLICY_REJECTED") });
    const timedOut = run(() => ({ submitted: false, txId: TX, submission: { submitResult: { accepted: false, error: "RPC request timed out after 30000ms" } } }));
    await expect(timedOut).rejects.toMatchObject({ code: "SILVER_SUBMIT_OUTCOME_UNKNOWN", message: expect.stringContaining(TX) });
    // "already in the mempool": the node may hold it — unknown, never rejected
    expect(await codeOf(run(() => ({ submitted: false, txId: TX, submission: { submitResult: { accepted: false, error: `Rejected transaction ${TX}: transaction ${TX} is already in the mempool` } } })))).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
    // an answer naming another transaction is not this one accepted
    expect(await codeOf(run(() => ({ submitted: true, txId: "cd".repeat(32) })))).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
    expect(await codeOf(run(() => { throw new HardkasError("SUBMIT_NOT_SENT", "the request never left this process"); }))).toBe("SILVER_SUBMIT_NOT_SENT");
    expect(await codeOf(run(() => { throw new HardkasError("INPUT_NOT_UNSPENT", "nothing was sent"); }))).toBe("INPUT_NOT_UNSPENT");
    expect(sends).toBe(8);
  });

  it("SE-2 genesis → transition 7 → 12: the corpus covenant id, the floor fees (208,300 and 71,900), the continuation keeps the rest and is the compiled successor", async () => {
    const ctx = await context([FIXTURE_ACCOUNT]);
    const g = await counterCovenant(ctx);
    expect(g).toMatchObject({ covenantId: COVENANT_ID, feeSompi: 208_300n, computeBudget: 10 });
    const t = await silverEngineTransition(ctx, bumpTo(g, 12n, 5n));
    expect(bumpTo(g, 12n, 5n).expectedSuccessorAddress).toBe(SUCCESSOR_ADDR);
    expect(t).toMatchObject({ valueSompi: 1_000_000_000n - 71_900n, feeSompi: 71_900n, computeBudget: 0 });
    expect(node.submits).toEqual([g.txId, t.txId]);
    node.mine(t.txId);
    expect(node.listed(SUCCESSOR_ADDR)).toEqual([expect.objectContaining({ outpoint: { transactionId: t.txId, index: 0 }, covenantId: COVENANT_ID, amountSompi: 1_000_000_000n - 71_900n })]);
  });

  it("SE-3 a transition the contract's policy rejects after the local validation passed: the node's final rejection (SILVER_REJECTED_BY_NODE), sent once, the covenant UTXO unspent, the same transaction never sent again, a corrected transition still possible", async () => {
    const ctx = await context([FIXTURE_ACCOUNT]);
    const g = await counterCovenant(ctx);
    // the engine validates templates, bindings, budgets and fees, not what the policy computes: the node runs the script
    node.rejectNext = "Rejected transaction $TX: failed to verify the signature script: script ran, but verification failed";
    const forged = bumpTo(g, 999n, 5n);
    const refused = await codeOf(silverEngineTransition(ctx, forged));
    expect(refused).toBe("SILVER_REJECTED_BY_NODE");
    expect(node.submits.length).toBe(2);
    const rejectedTx = node.submits[1]!;
    expect(node.listed(COUNTER_ADDR).some((u) => u.outpoint.transactionId === g.txId && u.outpoint.index === 0)).toBe(true);
    // the workspace recorded the rejection (final): the same transaction is not sent again
    expect(await codeOf(silverEngineTransition(ctx, forged))).toBe("TX_ALREADY_SUBMITTED");
    expect(node.submits.length).toBe(2);
    // a rejected transition is not pending: a corrected one goes through
    const corrected = await silverEngineTransition(ctx, bumpTo(g, 12n, 5n));
    expect(corrected.txId).not.toBe(rejectedTx);
    expect(node.submits).toEqual([g.txId, rejectedTx, corrected.txId]);
  });

  it("SE-4 an uncertain outcome (the answer lost after the node took it): SILVER_SUBMIT_OUTCOME_UNKNOWN naming the txId, never re-sent; the same command again observes the node holds it; another transition of the covenant waits for it (COVENANT_TRANSITION_PENDING)", async () => {
    const ctx = await context([FIXTURE_ACCOUNT]);
    const g = await counterCovenant(ctx);
    node.loseNextAnswer = true;
    const first = await codeOf(silverEngineTransition(ctx, bumpTo(g, 12n, 5n)));
    expect(first).toBe("SILVER_SUBMIT_OUTCOME_UNKNOWN");
    const sent = node.submits[1]!;
    // TX-SEND-IDEMPOTENT-1: the recorded submission, the node holds it — reported, not broadcast again
    expect((await silverEngineTransition(ctx, bumpTo(g, 12n, 5n))).txId).toBe(sent);
    expect(await codeOf(silverEngineTransition(ctx, bumpTo(g, 13n, 6n)))).toBe("COVENANT_TRANSITION_PENDING");
    expect(node.submits).toEqual([g.txId, sent]);
  });

  it("SE-5 a continuation that is not the successor the command compiled is refused before any key is read; nothing is signed or sent", async () => {
    const reads: string[] = [];
    const ctx = await context([FIXTURE_ACCOUNT]);
    const g = await counterCovenant(ctx);
    const keys = { publicKeyOf: ctx.keys.publicKeyOf, privateKeyOf: async (a: string) => (reads.push(a), ctx.keys.privateKeyOf(a)) };
    const wrong = { ...bumpTo(g, 12n, 5n), expectedSuccessorAddress: COUNTER_ADDR };
    expect(await codeOf(silverEngineTransition({ ...ctx, keys }, wrong))).toBe("SILVER_RECORD_NOT_REPRODUCED");
    expect(reads).toEqual([]);
    expect(node.submits).toEqual([g.txId]);
  });

  it("SE-6 deploy funds the P2SH of the compile record's artifact; spend sweeps it through the signers' slots (the floor fee, a recorded unlock); the deployed address must be the one silverc reproduces; swapped signers are refused before any key", async () => {
    const record = twoOfTwoCompileRecord();
    const { facts, ctor } = twoOfTwoFacts();
    const address = record.contracts[0].address;
    const ctx = await context([FIXTURE_ACCOUNT, accountOf("alice"), accountOf("bob")], { facts, records: [record] });
    const d = await silverEngineDeploy(ctx, { compileRecord: { contentHash: record.contentHash, artifactSha256: record.provenance.artifactSha256 }, contract: "TwoOfTwo", address, valueSompi: 500_000_000n, funder: FIXTURE });
    node.mine(d.txId);
    expect(node.listed(address)).toEqual([expect.objectContaining({ outpoint: { transactionId: d.txId, index: 0 }, amountSompi: 500_000_000n })]);
    const spend = (over: any = {}) => ({
      contract: { compileRecord: TWO_RECORD, contract: "TwoOfTwo", constructorArgs: ctor },
      entry: "spend",
      args: [{ kind: "signer", signer: "alice" }, { kind: "signer", signer: "bob" }] as any,
      outpoint: { transactionId: d.txId, index: 0 },
      address,
      to: FIXTURE,
      ...over
    });
    expect(await codeOf(silverEngineSpend(ctx, spend({ address: COUNTER_ADDR })))).toBe("SILVER_RECORD_NOT_REPRODUCED");
    expect(await codeOf(silverEngineSpend(ctx, spend({ args: [{ kind: "signer", signer: "bob" }, { kind: "signer", signer: "alice" }] })))).toBe("SIGNER_SLOT_KEY_MISMATCH");
    expect(node.submits).toEqual([d.txId]);
    const s = await silverEngineSpend(ctx, spend());
    expect(s.outputSompi + s.feeSompi).toBe(500_000_000n);
    expect(s.sequence).toBe("0");
    expect(s.signatureScriptHex).toMatch(/^[0-9a-f]+$/);
    // no certified budget for TwoOfTwo.spend: rusty-kaspa's estimate (two signature checks at least)
    expect(s.computeBudget).toBeGreaterThanOrEqual(20);
    expect(node.submits).toEqual([d.txId, s.txId]);
  });

  it("SE-7 a funder that cannot pay: SILVER_INSUFFICIENT_FUNDS, nothing sent; an account the command did not resolve has no key", async () => {
    const ctx = await context([FIXTURE_ACCOUNT]);
    expect(await codeOf(silverEngineGenesis(ctx, { contract: COUNTER, address: COUNTER_ADDR, valueSompi: 50_000_000_000n, funder: FIXTURE }))).toBe("SILVER_INSUFFICIENT_FUNDS");
    expect(node.submits).toEqual([]);
    expect(ctx.keys.publicKeyOf("fixture")).toBe(ctx.keys.publicKeyOf(FIXTURE));
    expect(await codeOf(ctx.keys.privateKeyOf("mallory"))).toBe("SILVER_ACCOUNT_KEY_UNAVAILABLE");
  });

  it("SE-8 the engine runs on the workspace's canonical simnet localnet only: a workspace whose simnet is its simulator is refused", async () => {
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { networks: { simnet: { kind: "simulated" } } };\n');
    expect(await codeOf(openCanonicalSilverSdk(ws, canonicalRpc()))).toBe("SILVER_NETWORK_NOT_SUPPORTED");
  });

  it("SE-9 `silver covenant inspect <id> --no-node --json`: the lineage the runner's artifacts give (genesis, transition, tip), unchecked at the node, so not verified; a malformed id is refused", async () => {
    const ctx = await context([FIXTURE_ACCOUNT]);
    const g = await counterCovenant(ctx);
    const t = await silverEngineTransition(ctx, bumpTo(g, 12n, 5n));
    await ctx.sdk.close();
    const run = async (args: string[]) => {
      let stdout = "";
      setGlobalOutput(createCommandOutput({ mode: "json", stdout: { write: (m: string) => void (stdout += m) }, stderr: { write: () => undefined } }));
      noteParsedWorkspace(ws);
      const program = new Command();
      program.exitOverride();
      registerSilverCommand(program);
      let error: any;
      try {
        await program.parseAsync(["node", "hardkas", "silver", "covenant", "inspect", ...args]);
      } catch (e) {
        error = e;
      }
      return { json: stdout ? JSON.parse(stdout) : undefined, error };
    };
    const r = await run([COVENANT_ID, "--no-node", "--no-states", "--json"]);
    expect(r.error).toBeUndefined();
    expect(r.json).toMatchObject({
      schema: "hardkas.silverCovenantInspect.v1",
      covenantId: COVENANT_ID,
      active: false,
      verified: false,
      checks: { anchor: "verified", links: "complete", conflicts: 0, node: "not-checked" },
      genesis: { txId: g.txId, anchorCheck: "verified" }
    });
    expect(r.json.transitions.map((x: any) => x.txId)).toEqual([t.txId]);
    expect(r.json.tip.map((x: any) => [x.outpoint, x.node, x.amountSompi])).toEqual([[`${t.txId}:0`, "not-checked", String(1_000_000_000n - 71_900n)]]);
    expect((await run(["not-a-covenant", "--no-node", "--json"])).error?.code).toBe("SILVER_FILE_NOT_FOUND");
  });
});
