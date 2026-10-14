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
// TASK-EVIDENCE-UNBOUND-1 (2026-10-14) · BEFORE. L1-REALITY-1 E1′: `hardkas task pay --evidence` paid for real on an
// isolated simnet node, and the package it wrote verified (`EVIDENCE_VERIFIED`) while carrying ZERO artifacts of that
// payment. Path under test: task → SDK → plan → signedTx → submission → scenarioResult → evidence pack → verify.
// A FAKE node on loopback (declares simnet, answers submissions like a node that accepted them; nothing leaves this
// process), built CLI + built SDK, real pinned kaspa-wasm, keystore accounts made by the CLI. Each case writes what it
// saw to $HARDKAS_TEU_TRACE_DIR.
//   TEU-1..TEU-3: the defect and its neighbours (expected to FAIL before a fix).
//   TEU-4..TEU-6: characterization of what EVIDENCE_VERIFIED establishes today, and of the task's own run (they pass:
//   they pin current guarantees so a fix states which ones change).
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
        case "submitTransaction":
          return ok({ transactionId: hashOf(0xa11) }); // a fake that accepts; nothing is broadcast anywhere
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

// The workspace a user writes for E1′: an rpc target on simnet, and a task that pays through the SDK it is lent.
const TASK_CONFIG = (url: string) => `export default {
  execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
  network: { allowPublic: false },
  networks: { simnet: { kind: "kaspa-rpc", network: "simnet", rpcUrl: ${JSON.stringify(url)} } },
  tasks: {
    pay: {
      description: "pay alice -> bob through the SDK",
      params: { amount: { type: "string", description: "KAS", defaultValue: "1", isOptional: true } },
      actionFn: async (args, hk) => {
        const plan = await hk.tx.plan({ from: "alice", to: "bob", amount: String(args.amount ?? "1") });
        const signed = await hk.tx.sign(plan, { account: "alice", keystorePassword: process.env.HK_TEU_PW });
        const sent = await hk.tx.send(signed);
        const art = sent?.artifact ?? sent;
        return { planHash: plan.contentHash, signedHash: signed.contentHash, submissionHash: art?.submission?.contentHash ?? art?.contentHash, txId: sent?.txId ?? art?.txId };
      }
    },
    boom: {
      description: "fails after planning",
      actionFn: async (_args, hk) => {
        await hk.tx.plan({ from: "alice", to: "bob", amount: "1" });
        throw new Error("task gave up");
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
/** The payment's chain as the store holds it: plan ← signed ← submission (authenticated lineage links). */
function paymentChain(all: Map<string, any>, signedHash: string) {
  const signed = all.get(signedHash);
  const plan = signed ? all.get(signed.lineage?.parentArtifactId) : undefined;
  const submission = [...all.values()].find((a) => /txSubmission/.test(String(a.schema)) && a.lineage?.parentArtifactId === signedHash);
  return { plan, signed, submission };
}

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

/** Runs `task pay --evidence` and reads back the run, the package and the store. */
async function payWithEvidence(node: Fake, extraArgs: string[] = []) {
  const ws = workspace(node.url);
  const r = await run(["task", "pay", "--network", "simnet", "--evidence", "--json", ...extraArgs], ws);
  const output = r.doc?.result?.output ?? {};
  const pkgPath = path.join(ws, "pay.hke.json");
  const pkg = fs.existsSync(pkgPath) && fs.statSync(pkgPath).isFile() ? JSON.parse(fs.readFileSync(pkgPath, "utf8")) : null;
  const all = store(ws);
  const chain = typeof output.signedHash === "string" ? paymentChain(all, output.signedHash) : { plan: undefined, signed: undefined, submission: undefined };
  return { ws, r, output, pkg, pkgPath, all, chain };
}

describe("TASK-EVIDENCE-UNBOUND-1 · the task's evidence package and the payment it made", () => {
  it("TEU-1 `task pay --evidence`: the package carries the payment's plan, signed transaction and submission, and its scenario result names them", async () => {
    const node = await startFake();
    try {
      const { r, output, pkg, chain } = await payWithEvidence(node);
      const chainIds = [chain.plan?.contentHash, chain.signed?.contentHash, chain.submission?.contentHash];
      const carried = (pkg?.artifacts ?? []).map((a: any) => a?.contentHash);
      const seen = {
        exit: r.status,
        submitReceived: node.methods.includes("submitTransaction"),
        taskOutput: output,
        storeChain: { plan: chainIds[0] ?? null, signed: chainIds[1] ?? null, submission: chainIds[2] ?? null, submissionParent: chain.submission?.lineage?.parentArtifactId ?? null, signedParent: chain.signed?.lineage?.parentArtifactId ?? null },
        package: pkg && { artifacts: carried.length, hashes: Object.keys(pkg.hashes ?? {}).length, named: pkg.scenarioResult?.artifactsGenerated ?? null, discovery: pkg.artifactDiscovery }
      };
      trace("TEU-1", seen);
      expect(r.status, r.brief).toBe(0);
      expect(seen.submitReceived).toBe(true);
      // the store holds the whole chain, linked by authenticated lineage (the information exists)
      expect(chainIds.every((id) => typeof id === "string"), JSON.stringify(seen)).toBe(true);
      // ...the package must carry it and its sealed scenario result must name it
      for (const id of chainIds) expect(carried, JSON.stringify(seen)).toContain(id);
      for (const id of chainIds) expect(pkg?.scenarioResult?.artifactsGenerated ?? [], JSON.stringify(seen)).toContain(id);
    } finally {
      await node.close();
    }
  });

  it("TEU-2 the scenario result records the execution mode the task ran in (rpc), not a label derived from the network name", async () => {
    const node = await startFake();
    try {
      const { r, pkg, chain } = await payWithEvidence(node);
      const seen = { exit: r.status, scenarioMode: pkg?.scenarioResult?.mode ?? null, packageMode: pkg?.mode ?? null, signedMode: chain.signed?.mode ?? null, submissionMode: chain.submission?.mode ?? null };
      trace("TEU-2", seen);
      expect(seen.signedMode, JSON.stringify(seen)).toBe("rpc");
      expect(seen.scenarioMode, JSON.stringify(seen)).toBe("rpc");
    } finally {
      await node.close();
    }
  });

  it("TEU-3 a package that cannot be written fails the command (non-zero exit, typed code), never `ok: true`", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      fs.mkdirSync(path.join(ws, "pay.hke.json")); // the package's target is a directory: the write fails
      const r = await run(["task", "pay", "--network", "simnet", "--evidence", "--json"], ws);
      const seen = { exit: r.status, ok: r.doc?.ok ?? null, code: r.doc?.code ?? null, stderrSaysFailed: /Failed to pack evidence/.test(r.stderr + r.stdout) };
      trace("TEU-3", seen);
      expect(seen.exit, r.brief).not.toBe(0);
      expect(seen.ok, r.brief).not.toBe(true);
    } finally {
      await node.close();
    }
  });
});

describe("TASK-EVIDENCE-UNBOUND-1 · what EVIDENCE_VERIFIED establishes today (characterization)", () => {
  it("TEU-4 integrity and membership only: an empty package verifies; a chain missing its plan verifies; an edited artifact or a dropped one does not; a re-sealed forgery verifies", async () => {
    const node = await startFake();
    try {
      const { ws, pkg, pkgPath, chain } = await payWithEvidence(node);
      const verify = async (p: string) => (await sdkMod.EvidenceManager.verify(p)).status;
      const write = (name: string, body: unknown) => {
        const p = path.join(ws, name);
        fs.writeFileSync(p, JSON.stringify(body, null, 2));
        return p;
      };
      const seal = (body: any) => {
        const { contentHash: _drop, ...rest } = body;
        return { ...rest, contentHash: artifactsMod.calculateContentHash(rest, rest.hashVersion ?? 5) };
      };
      // (a) the package the task wrote
      const asWritten = { artifacts: pkg?.artifacts?.length ?? null, status: await verify(pkgPath) };
      // (b) a sealed scenario result that names the signed transaction and its submission but not their plan
      const partialScenario = artifactsMod.createScenarioResultArtifact({
        scenarioName: "partial",
        status: "passed",
        networkId: "simnet",
        mode: "rpc",
        artifactsGenerated: [chain.signed.contentHash, chain.submission.contentHash]
      });
      const partialPath = write("partial.scenario.json", partialScenario);
      const partialPkg = await sdkMod.EvidenceManager.pack({ scenarioResultPath: partialPath, workspaceRoot: ws, outPath: path.join(ws, "partial.hke.json") });
      const missingParent = { carried: 2, signedParentCarried: false, status: await verify(partialPkg) };
      // (c) a carried artifact edited (its body no longer hashes to its identity)
      const full = JSON.parse(fs.readFileSync(partialPkg, "utf8"));
      const edited = structuredClone(full);
      edited.artifacts[1].networkId = "testnet-10";
      const editedStatus = await verify(write("edited.hke.json", edited));
      // (d) a named artifact dropped from the package
      const dropped = structuredClone(full);
      dropped.artifacts = dropped.artifacts.slice(0, 1);
      dropped.hashes = Object.fromEntries(Object.entries(dropped.hashes).slice(0, 1));
      const droppedStatus = await verify(write("dropped.hke.json", dropped));
      // (e) a forger edits the submission, re-seals it, renames it in a re-sealed scenario result: everything consistent
      const forged = structuredClone(full);
      const sub = forged.artifacts.find((a: any) => /txSubmission/.test(String(a.schema)));
      sub.networkId = "testnet-10";
      const resealed = seal(sub);
      forged.artifacts = forged.artifacts.map((a: any) => (a === sub ? resealed : a));
      forged.scenarioResult = seal({ ...forged.scenarioResult, artifactsGenerated: forged.artifacts.map((a: any) => a.contentHash) });
      forged.hashes = Object.fromEntries(forged.artifacts.map((a: any) => [a.contentHash, a.contentHash]));
      const forgedStatus = await verify(write("forged.hke.json", forged));
      const seen = { asWritten, missingParent, editedStatus, droppedStatus, forgedStatus };
      trace("TEU-4", seen);
      // pinned as they are today (BEFORE): membership is relative to what the scenario names; lineage is not checked;
      // the package is unsigned
      expect(asWritten).toEqual({ artifacts: 0, status: "EVIDENCE_VERIFIED" });
      expect(missingParent.status).toBe("EVIDENCE_VERIFIED");
      expect(editedStatus).toBe("EVIDENCE_ARTIFACT_HASH_MISMATCH");
      expect(droppedStatus).toBe("EVIDENCE_MEMBERSHIP_MISMATCH");
      expect(forgedStatus).toBe("EVIDENCE_VERIFIED");
    } finally {
      await node.close();
    }
  });

  it("TEU-5 a task that fails leaves no scenario result and no package (a failed run is not recorded as evidence)", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      const r = await run(["task", "boom", "--network", "simnet", "--evidence", "--json"], ws);
      const scenarios = [...store(ws).values()].filter((a) => /scenarioResult/.test(String(a.schema)));
      const seen = { exit: r.status, code: r.doc?.code ?? null, scenarioResults: scenarios.length, package: fs.existsSync(path.join(ws, "boom.hke.json")) };
      trace("TEU-5", seen);
      expect(seen.exit).not.toBe(0);
      expect(seen.scenarioResults).toBe(0);
      expect(seen.package).toBe(false);
    } finally {
      await node.close();
    }
  });

  it("TEU-6 the task without --network: where it runs (recorded)", async () => {
    const node = await startFake();
    try {
      const ws = workspace(node.url);
      const r = await run(["task", "pay", "--json"], ws);
      const scenario = [...store(ws).values()].find((a) => /scenarioResult/.test(String(a.schema)));
      const seen = { exit: r.status, code: r.doc?.code ?? null, message: String(r.doc?.message ?? "").slice(0, 300), nodeContacted: node.methods.length > 0, scenarioNetwork: scenario?.networkId ?? null, scenarioMode: scenario?.mode ?? null };
      trace("TEU-6", seen);
      expect(seen.exit === 0 || seen.exit === 1).toBe(true);
    } finally {
      await node.close();
    }
  });
});
