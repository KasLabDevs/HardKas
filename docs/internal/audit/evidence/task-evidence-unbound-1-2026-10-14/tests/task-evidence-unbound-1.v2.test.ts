import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// -----------------------------------------------------------------------------
// TASK-EVIDENCE-UNBOUND-1 (2026-10-14). L1-REALITY-1 E1′: `hardkas task pay --evidence` paid for real on an isolated
// simnet node, and the package it wrote verified (`EVIDENCE_VERIFIED`) while carrying ZERO artifacts of that payment.
// Path: task → SDK → plan → signedTx → submission → observation → scenarioResult → evidence pack → verify.
// Decisions (review 2026-10-14): D-TEU-1 a package claims a complete payment only when the payment's lineage closes
// inside it; D-TEU-2 an empty package is allowed only when declared empty, never as payment evidence; D-TEU-3
// EVIDENCE_VERIFIED = integrity + internal consistency, never chain inclusion or external authenticity; D-TEU-4 a failed
// task keeps sealed evidence of its failure. Conditions: only this run's artifacts; effective mode; typed pack failure;
// one source for the version; no secrets.
// A FAKE node on loopback (declares simnet, answers submissions like a node that accepted them; nothing leaves this
// process), built CLI + built SDK, real pinned kaspa-wasm, keystore accounts made by the CLI. Each case writes what it
// saw to $HARDKAS_TEU_TRACE_DIR.
// -----------------------------------------------------------------------------

let kaspa: any;
const hashOf = (n: number) => n.toString(16).padStart(64, "0");
function spkHex(address: string): string {
  const spk = kaspa.payToAddressScript(address);
  const script = typeof spk.script === "string" ? spk.script : Buffer.from(spk.script).toString("hex");
  return spk.version.toString(16).padStart(4, "0") + script;
}

type Fake = { url: string; methods: string[]; close(): Promise<void> };
async function startFake(network = "simnet"): Promise<Fake> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  const methods: string[] = [];
  const DAA = 50_000_000;
  server.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":1,"message":${JSON.stringify(message)}}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: DAA });
        case "getInfo":
          return ok({ p2pId: "fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [hashOf(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hashOf(1)], pruningPointHash: hashOf(2), virtualDaaScore: DAA, sink: hashOf(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: DAA });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: 100_00000000 })) });
        case "getUtxosByAddresses":
          return ok({
            entries: (params?.addresses ?? []).map((address: string, i: number) => ({
              address,
              outpoint: { transactionId: hashOf(0xf00 + i), index: 0 },
              utxoEntry: { amount: 100_00000000, scriptPublicKey: spkHex(address), blockDaaScore: DAA - 100_000, isCoinbase: false }
            }))
          });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntry":
          return err("transaction not found in mempool");
        case "getVirtualChainFromBlockV2":
        case "getVirtualChainFromBlock":
          return ok({ removedChainBlockHashes: [], addedChainBlockHashes: [], acceptedTransactionIds: [], chainBlockAcceptedTransactions: [] });
        case "submitTransaction": {
          // a fake that accepts, answering like a node: the id of the transaction it received (nothing is broadcast)
          let transactionId = hashOf(0xa11);
          const withoutNulls = (v: any): any =>
            Array.isArray(v) ? v.map(withoutNulls) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null).map(([k, x]) => [k, withoutNulls(x)])) : v;
          try {
            transactionId = String(new kaspa.Transaction(withoutNulls(params?.transaction)).id);
          } catch {
            /* keep the placeholder (a submission then disagrees with its signed transaction, and verify says so) */
          }
          return ok({ transactionId });
        }
        default:
          return err(`fake does not implement ${method}`);
      }
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    methods,
    close: () =>
      new Promise<void>((r) => {
        for (const c of server.clients) c.terminate();
        server.close(() => r());
      })
  };
}

const PW = "teu-test-password-only";
const traceDir = process.env.HARDKAS_TEU_TRACE_DIR;
function trace(name: string, data: unknown) {
  if (!traceDir) return;
  fs.mkdirSync(traceDir, { recursive: true });
  fs.writeFileSync(path.join(traceDir, `${name}.json`), JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

async function run(args: string[], cwd: string) {
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv({ HK_TEU_PW: PW }) });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill(), 200_000);
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
  let doc: any;
  for (const chunk of r.stdout.split(/\r?\n(?=[{\[])/)) {
    try {
      const d = JSON.parse(chunk.trim());
      if (d && typeof d === "object" && !Array.isArray(d)) doc = doc ?? d;
    } catch {
      /* not a document */
    }
  }
  return { ...r, doc, brief: `exit ${r.status}\n${r.stdout.slice(0, 1500)}\n${r.stderr.slice(0, 1200)}` };
}

// a secret the failing task's error carries (must never reach the sealed failure)
const SECRET = "teu-SECRET-4b1d";

// The workspace a user writes for E1′: an rpc target on simnet, and tasks lent the SDK.
const TASK_CONFIG = (url: string) => `export default {
  execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
  network: { allowPublic: false },
  networks: { simnet: { kind: "kaspa-rpc", network: "simnet", rpcUrl: ${JSON.stringify(url)} } },
  tasks: {
    pay: {
      description: "pay alice -> bob through the SDK, then observe it",
      params: { amount: { type: "string", description: "KAS", defaultValue: "1", isOptional: true } },
      actionFn: async (args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: String(args.amount ?? "1") });
        const signed = await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_TEU_PW });
        const sent = await hk.tx.send(signed);
        const art = sent?.artifact ?? sent;
        const txId = sent?.txId ?? art?.txId ?? signed.txId;
        const observed = await hk.tx.observe(txId, { maxBatches: 1 });
        return { planHash: plan.contentHash, signedHash: signed.contentHash, txId, observationHash: observed?.observation?.contentHash ?? null };
      }
    },
    paymix: {
      description: "pays on its own instance while ANOTHER instance of the same process plans in the same workspace",
      actionFn: async (_args, hk) => {
        const other = await hk.constructor.open({ cwd: process.cwd(), network: "simnet" });
        try {
          const [plan, foreign] = await Promise.all([
            hk.tx.plan({ from: "alice", to: "bob", amount: "1" }),
            other.tx.plan({ from: "alice", to: "bob", amount: "2" })
          ]);
          const signed = await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_TEU_PW });
          await hk.tx.send(signed);
          return { planHash: plan.contentHash, signedHash: signed.contentHash, foreignPlanHash: foreign.contentHash };
        } finally {
          await other.close();
        }
      }
    },
    noop: {
      description: "writes nothing",
      actionFn: async () => ({ hello: "world" })
    },
    planonly: {
      description: "plans and stops (a plan is stored only once signed: nothing is written)",
      actionFn: async (_args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        return { planHash: plan.contentHash };
      }
    },
    signonly: {
      description: "plans and signs, never sends (artifacts, no payment)",
      actionFn: async (_args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        const signed = await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_TEU_PW });
        return { planHash: plan.contentHash, signedHash: signed.contentHash };
      }
    },
    boom: {
      description: "fails after signing",
      actionFn: async (_args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_TEU_PW });
        throw new Error("task gave up at ws://op:${SECRET}@127.0.0.1:1/?token=${SECRET}");
      }
    }
  }
};
`;

let template: string;
const made: string[] = [];
function workspace(url: string): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-teu-"));
  made.push(ws);
  fs.cpSync(template, ws, { recursive: true });
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), TASK_CONFIG(url));
  return ws;
}

/** Every artifact of the workspace store, by identity. */
function store(ws: string): Map<string, any> {
  const root = path.join(ws, ".hardkas", "artifacts");
  const out = new Map<string, any>();
  if (!fs.existsSync(root)) return out;
  for (const rel of fs.readdirSync(root, { recursive: true }) as string[]) {
    const p = path.join(root, String(rel));
    if (!String(rel).endsWith(".json") || !fs.statSync(p).isFile()) continue;
    try {
      const a = JSON.parse(fs.readFileSync(p, "utf8"));
      if (typeof a?.contentHash === "string") out.set(a.contentHash, a);
    } catch {
      /* not an artifact */
    }
  }
  return out;
}
/** The payment's chain as the store holds it: plan ← signed ← submission ← observation (authenticated links). */
function paymentChain(all: Map<string, any>, signedHash: string) {
  const signed = all.get(signedHash);
  const plan = signed ? all.get(signed.lineage?.parentArtifactId) : undefined;
  const submission = [...all.values()].find((a) => /txSubmission/.test(String(a.schema)) && a.lineage?.parentArtifactId === signedHash);
  const observation = submission
    ? [...all.values()].find((a) => /txObservation/.test(String(a.schema)) && a.subject?.submissionArtifactId === submission.contentHash)
    : undefined;
  return { plan, signed, submission, observation };
}
const scenarioOf = (all: Map<string, any>, name: string) =>
  [...all.values()].filter((a) => /scenarioResult/.test(String(a.schema)) && a.scenarioName === name);

const dist = (pkg: string) => import(pathToFileURL(path.join(repoRoot, "packages", pkg, "dist", "index.js")).href);
let sdkMod: any;
let artifactsMod: any;

beforeAll(async () => {
  const coreMod: any = await import("@hardkas/core");
  kaspa = coreMod.loadManagedKaspaWasmSync();
  sdkMod = await dist("sdk");
  artifactsMod = await dist("artifacts");
  template = fs.mkdtempSync(path.join(os.tmpdir(), "hk-teu-template-"));
  made.push(template);
  fs.mkdirSync(path.join(template, ".hardkas"));
  fs.writeFileSync(
    path.join(template, "hardkas.config.ts"),
    'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n'
  );
  for (const name of ["alice", "bob"]) {
    const r = await run(["accounts", "real", "generate", "--name", name, "--network", "simnet", "--password-env", "HK_TEU_PW", "--json"], template);
    expect(r.status, r.brief).toBe(0);
  }
});
afterAll(() => {
  for (const ws of made) fs.rmSync(ws, { recursive: true, force: true });
});

/** Runs `task <name> --evidence` and reads back the run, the package and the store. */
async function taskWithEvidence(node: Fake, name = "pay", extraArgs: string[] = []) {
  const ws = workspace(node.url);
  const r = await run(["task", name, "--network", "simnet", "--evidence", "--json", ...extraArgs], ws);
  const output = r.doc?.result?.output ?? {};
  const pkgPath = path.join(ws, `${name}.hke.json`);
  const pkg = fs.existsSync(pkgPath) && fs.statSync(pkgPath).isFile() ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : null;
  const all = store(ws);
  const chain = typeof output.signedHash === "string" ? paymentChain(all, output.signedHash) : { plan: undefined, signed: undefined, submission: undefined, observation: undefined };
  return { ws, r, output, pkg, pkgPath, all, chain };
}
const verify = async (p: string) => sdkMod.EvidenceManager.verify(p);
const seal = (body: any) => {
  const { contentHash: _drop, ...rest } = body;
  return { ...rest, contentHash: artifactsMod.calculateContentHash(rest, rest.hashVersion ?? 5) };
};
/** Rebuilds a package as a forger would: every touched artifact re-sealed, the scenario renamed and re-sealed. */
function reseal(pkg: any, artifacts: any[]): any {
  const out = structuredClone(pkg);
  out.artifacts = artifacts;
  out.scenarioResult = seal({ ...out.scenarioResult, artifactsGenerated: artifacts.map((a: any) => a.contentHash) });
  out.hashes = Object.fromEntries(artifacts.map((a: any) => [a.contentHash, a.contentHash]));
  return out;
}
const writeJson = (dir: string, name: string, body: unknown) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, JSON.stringify(body, null, 2));
  return p;
};

describe("TASK-EVIDENCE-UNBOUND-1 · the task's evidence package and the payment it made", () => {
  it("TEU-1 `task pay --evidence`: the package carries plan, signed, submission and observation, names them, and verifies as a closed, observed payment", async () => {
    const node = await startFake();
    try {
      const { r, output, pkg, pkgPath, chain } = await taskWithEvidence(node);
      const chainIds = [chain.plan?.contentHash, chain.signed?.contentHash, chain.submission?.contentHash, chain.observation?.contentHash];
      const carried = (pkg?.artifacts ?? []).map((a: any) => a?.contentHash);
      const verdict = pkg ? await verify(pkgPath) : null;
      const seen = {
        exit: r.status,
        taskOutput: output,
        storeChain: chainIds,
        package: pkg && { artifacts: carried.length, named: pkg.scenarioResult?.artifactsGenerated ?? null, claim: pkg.scenarioResult?.evidenceClaim ?? null },
        verdict
      };
      trace("TEU-1", seen);
      expect(r.status, r.brief).toBe(0);
      expect(chainIds.every((id) => typeof id === "string"), JSON.stringify(seen)).toBe(true);
      for (const id of chainIds) expect(carried, JSON.stringify(seen)).toContain(id);
      for (const id of chainIds) expect(pkg?.scenarioResult?.artifactsGenerated ?? [], JSON.stringify(seen)).toContain(id);
      expect(verdict?.status, JSON.stringify(seen)).toBe("EVIDENCE_VERIFIED");
      expect(verdict?.scope?.claim, JSON.stringify(seen)).toBe("payment");
      expect(verdict?.scope?.payments?.[0], JSON.stringify(seen)).toMatchObject({
        txId: output.txId,
        complete: true,
        plan: chainIds[0],
        signed: chainIds[1],
        submission: chainIds[2],
        observations: [expect.objectContaining({ artifactId: chainIds[3] })]
      });
    } finally {
      await node.close();
    }
  });

  it("TEU-2 the scenario result and the package record the execution mode the task ran in (rpc), not a label derived from the network", async () => {
    const node = await startFake();
    try {
      const { r, pkg, chain } = await taskWithEvidence(node);
      const seen = { exit: r.status, scenarioMode: pkg?.scenarioResult?.mode ?? null, packageMode: pkg?.mode ?? null, signedMode: chain.signed?.mode ?? null };
      trace("TEU-2", seen);
      expect(seen.signedMode, JSON.stringify(seen)).toBe("rpc");
      expect(seen.scenarioMode, JSON.stringify(seen)).toBe("rpc");
      expect(seen.packageMode, JSON.stringify(seen)).toBe("rpc");
    } finally {
      await node.close();
    }
  });

  it("TEU-3 a package that cannot be written fails the command (non-zero exit, typed code), never `ok: true`; the scenario result stays", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      fs.mkdirSync(path.join(ws, "pay.hke.json")); // the package's target is a directory: the write fails
      const r = await run(["task", "pay", "--network", "simnet", "--evidence", "--json"], ws);
      const seen = { exit: r.status, ok: r.doc?.ok ?? null, code: r.doc?.code ?? null, scenarioResults: scenarioOf(store(ws), "pay").length };
      trace("TEU-3", seen);
      expect(seen.exit, r.brief).not.toBe(0);
      expect(seen.ok, r.brief).not.toBe(true);
      expect(seen.code, r.brief).toBe("EVIDENCE_PACK_FAILED");
      expect(seen.scenarioResults, r.brief).toBe(1);
    } finally {
      await node.close();
    }
  });
});

describe("TASK-EVIDENCE-UNBOUND-1 · a payment claim needs its closed lineage (D-TEU-1); other packages keep verifying", () => {
  it("TEU-8a a payment package with one payment artifact omitted (consistently re-sealed): not verified as that payment", async () => {
    const node = await startFake();
    try {
      const { ws, pkg, chain } = await taskWithEvidence(node);
      const withoutPlan = reseal(pkg, pkg.artifacts.filter((a: any) => a.contentHash !== chain.plan?.contentHash));
      const verdict = await verify(writeJson(ws, "omitted.hke.json", withoutPlan));
      const seen = { carried: withoutPlan.artifacts.length, verdict };
      trace("TEU-8a", seen);
      expect(verdict.ok, JSON.stringify(seen)).toBe(false);
      expect(verdict.status, JSON.stringify(seen)).toBe("EVIDENCE_PAYMENT_INCOMPLETE");
    } finally {
      await node.close();
    }
  });

  it("TEU-8b a payment package whose lineage was manipulated (signed re-parented and every artifact re-sealed): not verified as that payment", async () => {
    const node = await startFake();
    try {
      const { ws, pkg, chain } = await taskWithEvidence(node);
      const artifacts = structuredClone(pkg.artifacts);
      const signed = artifacts.find((a: any) => a.contentHash === chain.signed?.contentHash);
      const others = artifacts.filter((a: any) => a !== signed);
      const reparented = seal({ ...signed, lineage: { ...signed.lineage, parentArtifactId: hashOf(0xbad) } });
      // the submission follows its forged parent, re-sealed; the observation follows the submission, re-sealed
      const sub = others.find((a: any) => /txSubmission/.test(String(a.schema)));
      const forgedSub = seal({ ...sub, signedArtifactId: reparented.contentHash, lineage: { ...sub.lineage, parentArtifactId: reparented.contentHash } });
      const obs = others.find((a: any) => /txObservation/.test(String(a.schema)));
      const forgedObs = obs ? seal({ ...obs, subject: { ...obs.subject, submissionArtifactId: forgedSub.contentHash } }) : undefined;
      const rebuilt = [...others.filter((a: any) => a !== sub && a !== obs), reparented, forgedSub, ...(forgedObs ? [forgedObs] : [])];
      const forgedPkg = reseal(pkg, rebuilt);
      forgedPkg.scenarioResult = seal({
        ...forgedPkg.scenarioResult,
        evidenceClaim: forgedPkg.scenarioResult.evidenceClaim
          ? { ...forgedPkg.scenarioResult.evidenceClaim, payments: [{ txId: forgedSub.txId, submissionArtifactId: forgedSub.contentHash }] }
          : undefined
      });
      const verdict = await verify(writeJson(ws, "manipulated.hke.json", forgedPkg));
      const seen = { verdict };
      trace("TEU-8b", seen);
      expect(verdict.ok, JSON.stringify(seen)).toBe(false);
      expect(verdict.status, JSON.stringify(seen)).toBe("EVIDENCE_PAYMENT_INCOMPLETE");
    } finally {
      await node.close();
    }
  });

  it("TEU-8c a package that names nothing and does not declare itself empty (the E1′ shape) is not EVIDENCE_VERIFIED", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      // the scenario result the task wrote before the fix: sealed, no artifacts, no declaration
      const legacy = seal({
        schema: "hardkas.scenarioResult.v1",
        hardkasVersion: artifactsMod.HARDKAS_VERSION,
        version: "1.0.0-alpha",
        hashVersion: 5,
        createdAt: new Date().toISOString(),
        networkId: "simnet",
        mode: "localnet",
        scenarioName: "pay",
        status: "passed",
        artifactsGenerated: [],
        claims: { mainnet: false, testnet: false, production: false },
        metadata: { kind: "task", taskName: "pay", result: { txId: hashOf(0xa11) } }
      });
      const pkg = {
        version: "1.0.0-alpha",
        schema: "hardkas.evidencePackage.v1",
        name: "pay",
        hardkasVersion: artifactsMod.HARDKAS_VERSION,
        networkId: "simnet",
        mode: "localnet",
        createdAt: new Date().toISOString(),
        scenarioResult: legacy,
        artifacts: [],
        hashes: {},
        claims: { mainnet: false, testnet: false, production: false, bridgeReady: false, onchainZk: false },
        artifactDiscovery: { source: "scenarioResult" }
      };
      const verdict = await verify(writeJson(ws, "legacy-empty.hke.json", pkg));
      trace("TEU-8c", { verdict });
      expect(verdict.status).not.toBe("EVIDENCE_VERIFIED");
      expect(verdict.status).toBe("EVIDENCE_EMPTY_UNDECLARED");
    } finally {
      await node.close();
    }
  });

  it("TEU-8d a package that makes no payment claim keeps verifying with an open lineage, and says so", async () => {
    const node = await startFake();
    try {
      const { ws, chain } = await taskWithEvidence(node);
      // a sealed scenario result (the shared producer) that names a signed transaction and its submission, not their plan
      const partial = artifactsMod.createScenarioResultArtifact({
        scenarioName: "partial",
        status: "passed",
        networkId: "simnet",
        mode: "rpc",
        artifactsGenerated: [chain.signed.contentHash, chain.submission.contentHash]
      });
      const partialPkg = await sdkMod.EvidenceManager.pack({ scenarioResultPath: writeJson(ws, "partial.scenario.json", partial), workspaceRoot: ws, outPath: path.join(ws, "partial.hke.json") });
      const verdict = await verify(partialPkg);
      trace("TEU-8d", { verdict });
      expect(verdict.status).toBe("EVIDENCE_VERIFIED");
      expect(verdict.scope).toMatchObject({ claim: "artifacts", artifacts: 2, lineage: "open" });
      expect(verdict.scope.unresolved).toEqual([expect.objectContaining({ from: chain.signed.contentHash, missing: chain.plan.contentHash })]);
    } finally {
      await node.close();
    }
  });

  it("TEU-4 unchanged guarantees: an edited artifact and a dropped one are refused; a fully re-sealed forgery of a closed chain verifies (unsigned: authorship is not proven)", async () => {
    const node = await startFake();
    try {
      const { ws, pkg } = await taskWithEvidence(node);
      const edited = structuredClone(pkg);
      edited.artifacts[0].networkId = "testnet-10";
      const editedStatus = (await verify(writeJson(ws, "edited.hke.json", edited))).status;
      const dropped = structuredClone(pkg);
      dropped.artifacts = dropped.artifacts.slice(1);
      const droppedStatus = (await verify(writeJson(ws, "dropped.hke.json", dropped))).status;
      // the forger changes nothing that breaks the chain: re-seals the scenario result with a different name
      const forged = structuredClone(pkg);
      forged.scenarioResult = seal({ ...forged.scenarioResult, metadata: { ...forged.scenarioResult.metadata, note: "forged" } });
      const forgedVerdict = await verify(writeJson(ws, "forged.hke.json", forged));
      const seen = { editedStatus, droppedStatus, forgedVerdict };
      trace("TEU-4", seen);
      expect(editedStatus).toBe("EVIDENCE_ARTIFACT_HASH_MISMATCH");
      expect(droppedStatus).toBe("EVIDENCE_MEMBERSHIP_MISMATCH");
      expect(forgedVerdict.status).toBe("EVIDENCE_VERIFIED");
      expect(String(forgedVerdict.scope?.statement ?? ""), JSON.stringify(seen)).toMatch(/unsigned/i);
    } finally {
      await node.close();
    }
  });
});

describe("TASK-EVIDENCE-UNBOUND-1 · only this run, and the kinds of task", () => {
  it("TEU-7 another SDK instance of the same process writing in the same workspace during the task: its artifact is not named", async () => {
    const node = await startFake();
    try {
      const { r, output, pkg } = await taskWithEvidence(node, "paymix");
      const named: string[] = pkg?.scenarioResult?.artifactsGenerated ?? [];
      const seen = { exit: r.status, code: r.doc?.code ?? null, output, named };
      trace("TEU-7", seen);
      expect(r.status, r.brief).toBe(0);
      expect(named, JSON.stringify(seen)).toContain(output.planHash);
      expect(named, JSON.stringify(seen)).not.toContain(output.foreignPlanHash);
    } finally {
      await node.close();
    }
  });

  it("TEU-9 a task that writes nothing (noop, or a plan never signed) declares an empty package; one that signs without sending claims artifacts, not a payment", async () => {
    const node = await startFake();
    try {
      const none = await taskWithEvidence(node, "noop");
      const noneVerdict = none.pkg ? await verify(none.pkgPath) : null;
      const planned = await taskWithEvidence(node, "planonly");
      const plannedVerdict = planned.pkg ? await verify(planned.pkgPath) : null;
      const signonly = await taskWithEvidence(node, "signonly");
      const signVerdict = signonly.pkg ? await verify(signonly.pkgPath) : null;
      const seen = {
        noop: { exit: none.r.status, claim: none.pkg?.scenarioResult?.evidenceClaim ?? null, verdict: noneVerdict },
        planonly: { exit: planned.r.status, claim: planned.pkg?.scenarioResult?.evidenceClaim ?? null, verdict: plannedVerdict },
        signonly: { exit: signonly.r.status, claim: signonly.pkg?.scenarioResult?.evidenceClaim ?? null, verdict: signVerdict }
      };
      trace("TEU-9", seen);
      expect(seen.noop.claim, JSON.stringify(seen)).toEqual({ kind: "none" });
      expect(noneVerdict?.status, JSON.stringify(seen)).toBe("EVIDENCE_VERIFIED");
      expect(noneVerdict?.scope, JSON.stringify(seen)).toMatchObject({ claim: "none", artifacts: 0, payments: [] });
      expect(seen.planonly.claim, JSON.stringify(seen)).toEqual({ kind: "none" });
      expect(plannedVerdict?.status, JSON.stringify(seen)).toBe("EVIDENCE_VERIFIED");
      expect(seen.signonly.claim, JSON.stringify(seen)).toEqual({ kind: "artifacts" });
      expect(signVerdict?.status, JSON.stringify(seen)).toBe("EVIDENCE_VERIFIED");
      expect(signVerdict?.scope, JSON.stringify(seen)).toMatchObject({ claim: "artifacts", artifacts: 2, lineage: "closed", payments: [] });
    } finally {
      await node.close();
    }
  });

  it("TEU-10 a failed task keeps sealed evidence of the failure (status failed, what it wrote, no secret) and the command still fails", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      const r = await run(["task", "boom", "--network", "simnet", "--evidence", "--json"], ws);
      const scenarios = scenarioOf(store(ws), "boom");
      const pkgPath = path.join(ws, "boom.hke.json");
      const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : null;
      const verdict = pkg ? await verify(pkgPath) : null;
      const everything = JSON.stringify({ stdout: r.stdout, stderr: r.stderr, scenarios, pkg });
      const seen = {
        exit: r.status,
        code: r.doc?.code ?? null,
        scenario: scenarios[0] ? { status: scenarios[0].status, error: scenarios[0].error, named: scenarios[0].artifactsGenerated.length, claim: scenarios[0].evidenceClaim } : null,
        verdict,
        secretAnywhere: everything.includes(SECRET)
      };
      trace("TEU-10", seen);
      expect(seen.exit, r.brief).not.toBe(0);
      expect(seen.code, r.brief).toBe("TASK_FAILED");
      expect(scenarios.length, r.brief).toBe(1);
      expect(seen.scenario).toMatchObject({ status: "failed", named: 2, claim: { kind: "artifacts" } });
      expect(verdict?.status, JSON.stringify(seen)).toBe("EVIDENCE_VERIFIED");
      expect(verdict?.scope?.verdict, JSON.stringify(seen)).toBe("failed");
      expect(seen.secretAnywhere, JSON.stringify(seen)).toBe(false);
    } finally {
      await node.close();
    }
  });

  it("TEU-6 the task without --network runs on the workspace's default and records its effective mode", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      const r = await run(["task", "pay", "--json"], ws);
      const scenario = scenarioOf(store(ws), "pay")[0];
      const seen = { exit: r.status, nodeContacted: node.methods.length > 0, scenarioNetwork: scenario?.networkId ?? null, scenarioMode: scenario?.mode ?? null };
      trace("TEU-6", seen);
      expect(seen.exit, r.brief).toBe(0);
      expect(seen.scenarioNetwork).toBe("simnet");
      expect(seen.scenarioMode).toBe("rpc");
    } finally {
      await node.close();
    }
  });
});

describe("TASK-EVIDENCE-UNBOUND-1 · what the verifier says (D-TEU-3) and where the version comes from", () => {
  it("TEU-11 `evidence verify` states its scope: artifacts, claim, lineage, and that it is not a proof of chain inclusion", async () => {
    const node = await startFake();
    try {
      const { ws, pkgPath } = await taskWithEvidence(node);
      const json = await run(["evidence", "verify", pkgPath, "--json"], ws);
      const human = await run(["evidence", "verify", pkgPath], ws);
      const seen = { json: json.doc, human: (human.stdout + human.stderr).slice(0, 800) };
      trace("TEU-11", seen);
      expect(json.doc?.result?.status, json.brief).toBe("EVIDENCE_VERIFIED");
      expect(json.doc?.result?.scope, json.brief).toMatchObject({ artifacts: 4, claim: "payment", lineage: "closed" });
      expect(String(json.doc?.result?.scope?.statement ?? ""), json.brief).toMatch(/not a proof of inclusion/i);
      expect(seen.human, human.brief).toMatch(/4 artifacts/);
      expect(seen.human, human.brief).toMatch(/not a proof of inclusion/i);
    } finally {
      await node.close();
    }
  });

  it("TEU-12 the package's hardkasVersion is the product version from its one source", async () => {
    const node = await startFake();
    try {
      const { pkg } = await taskWithEvidence(node, "noop");
      const src = fs.readFileSync(path.join(repoRoot, "packages", "sdk", "src", "evidence.ts"), "utf8");
      const seen = { packaged: pkg?.hardkasVersion ?? null, product: artifactsMod.HARDKAS_VERSION, literalInSource: /hardkasVersion:\s*"\d/.test(src) };
      trace("TEU-12", seen);
      expect(seen.packaged).toBe(seen.product);
      expect(seen.literalInSource, JSON.stringify(seen)).toBe(false);
    } finally {
      await node.close();
    }
  });
});
