import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import { runCli } from "./first-contact-helpers.js";

// Demo-cut step 2 · T-A14b — negative search of the forbidden narratives on the
// surfaces this block touches, in the code (comments stripped: they name the
// phrases in order to forbid them) and in what the built CLI prints.

const SRC = path.resolve(__dirname, "../src");
const TOUCHED = [
  "commands/tx.ts",
  "commands/explain.ts",
  "runners/tx-status-runner.ts",
  "runners/tx-wait-runner.ts",
  "runners/next-steps.ts"
];

const stripComments = (code: string) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, "$1"))
    .join("\n");

describe("Demo-cut · T-A14b · no unbacked consensus, settlement or finality claims", () => {
  it("the touched CLI sources contain none of the forbidden narratives", () => {
    const offending: string[] = [];
    for (const rel of TOUCHED) {
      const code = stripComments(fs.readFileSync(path.join(SRC, rel), "utf8"));
      const checks: Array<[string, RegExp]> = [
        ["Consensus Validated: YES", /"Consensus Validated"[^\n]*"YES"/],
        ["Settlement Proof", /Settlement Proof/],
        ["performed by remote node", /performed by remote node/],
        ["implies Kaspa consensus", /implies Kaspa consensus/],
        ["assume confirmed", /assume confirmed/i],
        ["broadcast successfully", /broadcast successfully/i]
      ];
      for (const [label, re] of checks) if (re.test(code)) offending.push(`${rel}: ${label}`);
    }
    expect(offending).toEqual([]);
  });
});

describe("Demo-cut · T-A14b · what the built CLI prints for tx status, tx wait and explain", () => {
  let ws: string;
  let syntheticTxId: string;
  let submissionId: string;
  const TX = "2".repeat(64);

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dc-ta14b-cli-"));
    const sdk: any = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
    const { receipt } = await sdk.tx.simulate(await sdk.tx.sign(plan, "alice"));
    syntheticTxId = receipt.txId;

    // A recorded network submission (scripted node; nothing leaves the process).
    const p2 = await sdk.tx.plan({ from: "alice", to: "carol", amount: "2" });
    const signed: any = await sdk.tx.sign(p2, "alice");
    const s: any = structuredClone(signed);
    delete s.authorization;
    s.signedTransaction = { format: "hex", payload: "deadbeef" };
    s.txId = TX;
    delete s.contentHash;
    s.lineage = { ...s.lineage, artifactId: "" };
    s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
    s.lineage.artifactId = s.contentHash;
    s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
    await sdk.artifacts.write(s);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 10n, tipHashes: ["a".repeat(64)], virtualParentHashes: ["a".repeat(64)], sink: "a".repeat(64) } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "10" } as any);
    vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: TX } as any);
    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");
    vi.restoreAllMocks();
    // Recorded by a simulated-network SDK: re-seal it as what a simnet send records
    // (network, mode, execution) and replace it in the store.
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    const file = path.join(dir, fs.readdirSync(dir).find((f) => f.includes(sent.submission.contentHash))!);
    const sub = JSON.parse(fs.readFileSync(file, "utf8"));
    sub.networkId = "simnet";
    sub.mode = "localnet";
    sub.execution = { mode: "localnet", domain: "kaspa-l1", network: "simnet" };
    delete sub.contentHash;
    sub.contentHash = calculateContentHash(sub, CURRENT_HASH_VERSION);
    if (sub.lineage) sub.lineage.artifactId = sub.contentHash; // exact-path self reference, excluded from the hash
    fs.unlinkSync(file);
    await sdk.artifacts.write(sub);
    submissionId = sub.contentHash;
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("tx status <network txId> --no-observe: SUBMITTED from the recorded submission, with the policy and no claims", () => {
    const r = runCli(["tx", "status", TX, "--no-observe"], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Transaction state: SUBMITTED/);
    expect(r.out).toMatch(/no new observation: not requested \(--no-observe\)/);
    expect(r.out).toMatch(/a HardKAS product default, not a Kaspa parameter/);
    expect(r.out).not.toMatch(/Consensus Validated|Settlement Proof|performed by remote node/);
    const j = runCli(["tx", "status", TX, "--no-observe", "--json"], ws);
    expect(JSON.parse(j.stdout.trim())).toMatchObject({ ok: true, command: "tx status", state: "SUBMITTED", look: { taken: false } });
  });

  it("tx status <synthetic txId>: SYNTHETIC_EXECUTED; tx wait on it says there is no network and exits 0", () => {
    const s = runCli(["tx", "status", syntheticTxId], ws);
    expect(s.status, s.out).toBe(0);
    expect(s.out).toMatch(/Transaction state: SYNTHETIC_EXECUTED/);
    const w = runCli(["tx", "wait", syntheticTxId, "--json"], ws);
    expect(w.status, w.out).toBe(0);
    expect(JSON.parse(w.stdout.trim())).toMatchObject({ ok: true, command: "tx wait", outcome: "synthetic", state: "SYNTHETIC_EXECUTED", looks: 0 });
    expect(w.out).not.toMatch(/Settlement|CONFIRMED/);
  });

  it("tx wait rejects an unknown target with a usage error", () => {
    const w = runCli(["tx", "wait", TX, "--until", "forever"], ws);
    expect(w.status).toBe(2);
    expect(w.out).toMatch(/TX_WAIT_TARGET_INVALID/);
  });

  it("tx status <path> keeps the signature-coverage view", () => {
    const signedDir = path.join(ws, ".hardkas", "artifacts", "signed");
    const file = path.join(signedDir, fs.readdirSync(signedDir)[0]!);
    const r = runCli(["tx", "status", file], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/HardKAS Transaction Status/);
    expect(r.out).toMatch(/Signed ID:/);
  });

  it("explain on the network submission derives its state and makes no consensus claim", () => {
    const r = runCli(["explain", submissionId], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Network State\s+SUBMITTED — derived from the evidence in this workspace/);
    expect(r.out).not.toMatch(/Consensus Validation|performed by remote node|implies Kaspa consensus/);
  });
});
