import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";
import { officialSignedPayload } from "../../sdk/test/helpers/official-signed-payload.js";
import { withClientUrl } from "../../sdk/test/helpers/rpc-instance.js";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// INT9 · C4 · `why --tx` / `explain --tx` of a txId with no submission recorded here. STAGE-B-2 explained a tx this
// workspace only OBSERVED; a tx it SIGNED but has no submission of (sent from another workspace, not sent yet, or its
// record lost — the I-2 case) failed with RECEIPT_NOT_FOUND although the workspace holds its signed transaction and plan.
// Now both commands say what is known, and only that:
//   * signed here → origin "signed": the signed artifact and the plan it names; no submission; no network state derived
//     (a signed transaction is authorization, not a network fact) unless looks are stored, which then decide the state;
//   * nothing at all → the refusal stays (exit ≠ 0, no invention) and says what was looked for;
//   * an artifact that does not verify counts for nothing.
// Offline: nothing is contacted (the workspace's node is a closed loopback port; every CLI process logs its dials).
// -----------------------------------------------------------------------------

const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const H = (n: number) => n.toString(16).padStart(64, "0");
const UTXOS = [{ outpoint: { transactionId: "c".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false }];

const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-c4-netlogs-"));
made.push(logs);

/** A workspace holding a plan and its signed payment (no submission); with `observed`, also one look accepting it. */
async function signedWorkspace(label: string, opts: { observed?: boolean; tamper?: boolean } = {}): Promise<{ ws: string; txId: string; signedId: string; planId: string }> {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), `hk-c4-${label}-`));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
  const cfg: any = sdk.config.config;
  cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
  const chain = [
    { hash: H(1), blueScore: 1n, daaScore: 1n, accepted: [] as string[] },
    { hash: H(2), blueScore: 10n, daaScore: 999_000n, accepted: [] as string[] }
  ];
  vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async (a: string) => (a === FROM ? UTXOS.map((u) => ({ ...u })) : []) as any);
  vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
  vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: [H(2)], sink: H(2) } as any);
  vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "500" } as any);
  vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
  vi.spyOn(sdk.rpc, "call").mockImplementation(async (method: string, params: any) => {
    switch (method) {
      case "getBlockDagInfo":
        return { networkName: "simnet", virtualDaaScore: "1000000", sink: H(2), pruningPointHash: H(1) };
      case "getServerInfo":
        return { networkId: "simnet", serverVersion: "2.1.0", isSynced: true };
      case "getMempoolEntry":
        throw Object.assign(new Error("transaction not found"), { code: "RPC_NOT_FOUND" });
      case "getVirtualChainFromBlock": {
        const i = chain.findIndex((b) => b.hash === params.startHash);
        const added = chain.slice(i + 1);
        return { removedChainBlockHashes: [], addedChainBlockHashes: added.map((b) => b.hash), acceptedTransactionIds: added.map((b) => ({ acceptingBlockHash: b.hash, acceptedTransactionIds: b.accepted })) };
      }
      case "getBlock": {
        const b = chain.find((x) => x.hash === params.hash)!;
        return { block: { header: { hash: b.hash, blueScore: b.blueScore.toString(), daaScore: b.daaScore.toString() } } };
      }
      default:
        throw new Error(`unscripted rpc ${method}`);
    }
  });
  withClientUrl(sdk, "http://127.0.0.1:16110");
  const plan: any = await sdk.tx.plan({
    from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
    to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
    amount: "2",
    feeRate: 1000n
  });
  await sdk.artifacts.write(plan);
  const official = officialSignedPayload({
    inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index } })),
    outputs: [
      ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
      ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
    ]
  });
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
    txId: official.txId,
    signedTransaction: { format: "hex", payload: official.payload },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx)
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  await sdk.artifacts.write(s);
  if (opts.observed) {
    chain[1]!.accepted.push(official.txId);
    await sdk.tx.observe(official.txId, { since: H(1) });
  }
  await sdk.close?.();
  vi.restoreAllMocks();
  if (opts.tamper) {
    // the signed artifact's body changed after it was sealed: its identity no longer verifies
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const f of walk(path.join(ws, ".hardkas", "artifacts"))) {
      const a = JSON.parse(fs.readFileSync(f, "utf8"));
      if (a?.contentHash === s.contentHash) fs.writeFileSync(f, JSON.stringify({ ...a, amountSompi: "1" }));
    }
  }
  return { ws, txId: official.txId, signedId: s.contentHash, planId: plan.contentHash };
}

async function run(name: string, args: string[], cwd: string) {
  const log = path.join(logs, `${name}.net.log`);
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  return { ...r, json, dialled, all: `${r.stdout}\n${r.stderr}`, brief: `exit ${r.status}\n${r.stdout.slice(0, 2500)}\n${r.stderr.slice(0, 1500)}` };
}
const submissionsOf = (ws: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /submission/i.test(f)) : [];
};

beforeAll(() => {
  assertHermeticPreloadActive();
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("INT9 · C4 · why --tx / explain --tx of a tx signed here with no submission recorded", () => {
  it("C4-1 signed only: why --tx answers origin 'signed' with the signed artifact and its plan, no submission, no derived network state; nothing contacted", async () => {
    const w = await signedWorkspace("c4-1");
    const r = await run("C4-1", ["why", "--tx", w.txId, "--json"], w.ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.json, r.brief).toMatchObject({ target: w.txId, origin: "signed", txId: w.txId, submission: null, state: "INSUFFICIENT_EVIDENCE", observations: [] });
    expect(r.json.signed, r.brief).toHaveLength(1);
    expect(r.json.signed[0], r.brief).toMatchObject({ artifactId: w.signedId, planArtifactId: w.planId, networkId: "simnet" });
    expect(String(r.json.note), r.brief).toMatch(/no submission of it is recorded here/);
    expect(r.dialled, "no connection").toEqual([]);
    expect(submissionsOf(w.ws)).toEqual([]);
  });

  it("C4-2 signed only: explain --tx explains it as signed here, not sent from here, and derives no state; exit 0", async () => {
    const w = await signedWorkspace("c4-2");
    const r = await run("C4-2", ["explain", "--tx", w.txId], w.ws);
    expect(r.status, r.brief).toBe(0);
    expect(r.all, r.brief).toMatch(/signed in this workspace/);
    expect(r.all, r.brief).toMatch(/no submission of it is recorded here/);
    expect(r.all, r.brief).toContain(w.signedId);
    expect(r.all, r.brief).toContain(w.planId);
    expect(r.all, r.brief).toMatch(/not observed here/);
    expect(r.all, r.brief).not.toMatch(/CONFIRMED|ACCEPTED|Transaction submitted/);
    expect(r.dialled, "no connection").toEqual([]);
  });

  it("C4-3 signed and observed: the stored looks decide the state (CONFIRMED), and the signed artifact is named beside them", async () => {
    const w = await signedWorkspace("c4-3", { observed: true });
    const why = await run("C4-3-why", ["why", "--tx", w.txId, "--json"], w.ws);
    expect(why.status, why.brief).toBe(0);
    expect(why.json, why.brief).toMatchObject({ origin: "observed", state: "CONFIRMED", submission: null, acceptingBlockHash: H(2) });
    expect(why.json.signed?.[0]?.artifactId, why.brief).toBe(w.signedId);
    const explain = await run("C4-3-explain", ["explain", "--tx", w.txId], w.ws);
    expect(explain.status, explain.brief).toBe(0);
    expect(explain.all, explain.brief).toMatch(/CONFIRMED/);
    expect(explain.all, explain.brief).toContain(w.signedId);
    expect(explain.all, explain.brief).toMatch(/no submission of it is recorded here/);
    expect([...why.dialled, ...explain.dialled], "no connection").toEqual([]);
  });

  it("C4-4 (control) nothing about the txId here: both refuse (exit ≠ 0), saying what was looked for; nothing invented, nothing contacted", async () => {
    const w = await signedWorkspace("c4-4");
    const other = "d".repeat(64);
    const why = await run("C4-4-why", ["why", "--tx", other, "--json"], w.ws);
    const explain = await run("C4-4-explain", ["explain", "--tx", other], w.ws);
    for (const r of [why, explain]) {
      expect(r.status, r.brief).not.toBe(0);
      expect(r.all, r.brief).toMatch(/holds nothing about tx/);
      expect(r.all, r.brief).toMatch(/no submission, no signed transaction and no observation/);
      expect(r.dialled, "no connection").toEqual([]);
    }
    expect(why.json?.code, why.brief).toBe("RECEIPT_NOT_FOUND");
  });

  it("C4-5 a signed artifact that does not verify counts for nothing: the same refusal as C4-4", async () => {
    const w = await signedWorkspace("c4-5", { tamper: true });
    const r = await run("C4-5", ["why", "--tx", w.txId, "--json"], w.ws);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.json?.code, r.brief).toBe("RECEIPT_NOT_FOUND");
    expect(r.all, r.brief).toMatch(/holds nothing about tx/);
  });
});
