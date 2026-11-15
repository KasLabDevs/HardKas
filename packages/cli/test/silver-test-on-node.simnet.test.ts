import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { KASPAD_REFERENCE_IMAGE, getSilContract, loadManagedKaspaWasmSync, parseSilAbiArtifact, silContractBytecodeHex, silverP2shAddress } from "@hardkas/core";
import { fundTestAccount, getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, type IsolatedSimnetSession } from "../../testing/src/index.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// R4-S · `hardkas silver test --on-node` through the built CLI against a real rusty-kaspad v2.1.0 (the isolated simnet
// harness's own container). The contract requires the right guess AND the owner's signature. Every transaction is built
// and sent by the CLI (one coin per case funded from alice by the SDK's payment path, then the case's real spend: v0, or
// v1 through the SDK's engine when the case says version 1 or nothing); the node decides; this test mines blocks while
// the CLI runs and then checks the node's UTXO index on its own.
//
//   O-1 a passing v0 case (accepted, mined, the value at bob), two cases the node must refuse (a wrong guess, a stranger's
//       signature: both refused by the node, so the expected failures pass), a passing v1 case, and a case that is not
//       reproducible (no tx: the runner's default scenario). Exit 1 (SILVER_TEST_NOT_REPRODUCIBLE), the record says
//       CONSENSUS_SIMNET with the txid for the four node verdicts, NOT_REPRODUCIBLE (no verdict, nothing funded) for the
//       fifth; summary level CONSENSUS_SIMNET for 4 of 5 cases
//   O-2 a node verdict against the expectation fails the run: a case expecting a pass that the node refuses, and one
//       expecting a failure that the node accepts: exit 1 (SILVER_TEST_FAILED), both FAIL, status FAIL
//
// Evidence: a JSON written to HARDKAS_TEST_SILVER_ON_NODE_EVIDENCE (or the OS temp directory).
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const ALICE_ENV = "HK_R4S_ALICE_KEY";
const BOB_ENV = "HK_R4S_BOB_KEY";

const SOURCE = `pragma silverscript ^0.1.0;

contract GuardedRelease(pubkey owner, int secret) {
    entry release(sig ownerSig, int guess) {
        require(guess == secret);
        require(checkSig(ownerSig, owner));
    }
}
`;

let session: IsolatedSimnetSession;
let parent = "";
let ws = "";
let k: any;
let BOB = "";
let BOB_P2PK = "";
let BOB_KEY = "";
let compileRecordPath = "";
let contractAddress = "";
const evidence: Record<string, any> = { schema: "hardkas.r4.silverTestOnNode.v1", startedAt: new Date().toISOString(), node: {}, runs: [] as any[] };

interface Run {
  status: number | null;
  json: any;
  text: string;
}

const childEnv = () => ({ ...process.env, NO_COLOR: "1", [ALICE_ENV]: session.minerPrivateKey, [BOB_ENV]: BOB_KEY });

function parseDocs(stdout: string): any[] {
  return String(stdout ?? "")
    .trim()
    .split(/\r?\n(?=\{)/)
    .map((c) => {
      try {
        return JSON.parse(c);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);
}

function hk(args: string[], cwd = ws): Run {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv(), timeout: 600_000, windowsHide: true });
  const docs = parseDocs(r.stdout);
  return { status: r.status, json: docs[docs.length - 1], text: `${r.stdout}\n${r.stderr}`.slice(0, 6000) };
}

/** The CLI run while this test mines a block every ~400 ms (the isolated node has no miner of its own). */
function hkMining(args: string[], cwd = ws): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), windowsHide: true });
    let stdout = "";
    let stderr = "";
    let done = false;
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    const miner = (async () => {
      while (!done) {
        try {
          await mineBlocks(session, 1);
        } catch {
          /* the next round mines again */
        }
        await new Promise((r) => setTimeout(r, 400));
      }
    })();
    const timer = setTimeout(() => child.kill(), 600_000);
    child.on("close", async (status) => {
      clearTimeout(timer);
      done = true;
      await miner;
      const docs = parseDocs(stdout);
      resolve({ status, json: docs.find((d) => d?.schema === "hardkas.silverNodeTest.v1") ?? docs[docs.length - 1], text: `${stdout}\n${stderr}`.slice(0, 12000) });
    });
  });
}

const listed = async (address: string) =>
  (await session.rpc.getUtxosByAddress(address)).map((u: any) => ({ txId: String(u.outpoint.transactionId).toLowerCase(), index: Number(u.outpoint.index), amountSompi: BigInt(u.amountSompi) }));

const v0 = (utxo: number, out: number) => ({ version: 0, inputs: [{ utxo_value: utxo, sig_op_count: 1, sequence: 0 }], outputs: [{ value: out, script_hex: BOB_P2PK }] });

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  BOB_KEY = getHardkasFixtureKey("bob");
  const bobPub = new k.PrivateKey(BOB_KEY).toPublicKey();
  BOB = String(bobPub.toAddress("simnet").toString());
  BOB_P2PK = `20${String(bobPub.toXOnlyPublicKey().toString()).toLowerCase()}ac`;
  const aliceXOnly = [...Buffer.from(String(new k.PrivateKey(session.minerPrivateKey).toPublicKey().toXOnlyPublicKey().toString()), "hex")];
  const info: any = await session.rpc.getServerInfo();
  evidence.node = { rpcUrl: session.rpcUrl, containerName: session.containerName, image: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE, serverVersion: info.serverVersion, networkId: info.networkId };
  await fundTestAccount(session, session.minerAddress, 2_000_000_000n);
  await mineBlocks(session, 40);

  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4s-onnode-"));
  const init = hk(["init", "app", "--network", "simnet", "--skip-toolchain", "--json"], parent);
  expect(init.status, init.text).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts: {
      alice: { kind: "kaspa", network: "simnet", address: session.minerAddress, privateKeyEnv: ALICE_ENV },
      bob: { kind: "kaspa", network: "simnet", address: BOB, privateKeyEnv: BOB_ENV }
    }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  fs.writeFileSync(path.join(ws, "guarded.sil"), SOURCE);
  fs.writeFileSync(path.join(ws, "guarded.ctor.json"), JSON.stringify([{ kind: "bytes", value: aliceXOnly }, { kind: "int", value: 42 }]));
  const c = hk(["silver", "compile", "guarded.sil", "--args", "guarded.ctor.json", "--network", "simnet", "--out", "guarded.record.json", "--json"]);
  expect(c.status, c.text).toBe(0);
  compileRecordPath = path.join(ws, "guarded.record.json");
  const record = JSON.parse(fs.readFileSync(compileRecordPath, "utf8"));
  contractAddress = silverP2shAddress(silContractBytecodeHex(getSilContract(parseSilAbiArtifact(JSON.parse(record.artifactJson))).contract), "simnet");
});

afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  const file = process.env.HARDKAS_TEST_SILVER_ON_NODE_EVIDENCE || path.join(os.tmpdir(), `silver-test-on-node-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(evidence, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
    console.log(`[silver-test-on-node] evidence written to ${file}`);
  } catch {
    /* diagnostic */
  }
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

const testArgs = (tests: string) => ["silver", "test", "guarded.record.json", "--args", "guarded.ctor.json", "--tests", tests, "--on-node", "--from", "alice", "--timeout", "120", "--json"];

describe("R4-S · silver test --on-node: a node's verdict on every case's real transaction", () => {
  it("O-1 a passing v0 case, two the node must refuse, a passing v1 case and one not reproducible: four CONSENSUS_SIMNET verdicts with txids, one NOT_REPRODUCIBLE, exit 1", async () => {
    const tests = {
      tests: [
        { name: "owner-right-guess-v0", function: "release", args: [{ signature: "alice" }, "42"], expect: "pass", tx: v0(1_000_000_000, 999_000_000) },
        { name: "owner-wrong-guess-v0", function: "release", args: [{ signature: "alice" }, "41"], expect: "fail", tx: v0(1_000_000_000, 999_000_000) },
        { name: "stranger-signs-v0", function: "release", args: [{ signature: "bob" }, "42"], expect: "fail", tx: v0(1_000_000_000, 999_000_000) },
        { name: "owner-right-guess-v1", function: "release", args: [{ signature: "alice" }, "42"], expect: "pass", tx: { inputs: [{ utxo_value: 1_000_000_000 }], outputs: [{ value: 999_000_000, script_hex: BOB_P2PK }] } },
        { name: "runner-default-scenario", function: "release", args: [{ signature: "alice" }, "42"], expect: "pass" }
      ]
    };
    fs.writeFileSync(path.join(ws, "o1.test.json"), JSON.stringify(tests));
    const bobBefore = new Set((await listed(BOB)).map((u) => `${u.txId}:${u.index}`));
    const r = await hkMining(testArgs("o1.test.json"));
    const rec = r.json;
    evidence.runs.push({ id: "O-1", exit: r.status, record: rec });
    expect(rec?.schema, r.text).toBe("hardkas.silverNodeTest.v1");
    expect(r.status, r.text).toBe(1);
    expect(rec.networkId).toBe("simnet");
    expect(rec.mode).toBe("rpc");
    expect(rec.address).toBe(contractAddress);
    expect(rec.node?.verification, r.text).toBe("endpoint");
    const row = (name: string) => rec.results.find((x: any) => x.name === name);
    expect(rec.results.map((x: any) => [x.name, x.outcome, x.nodeVerdict, x.verdictLevel])).toEqual([
      ["owner-right-guess-v0", "PASS", "ACCEPTED", "CONSENSUS_SIMNET"],
      ["owner-wrong-guess-v0", "PASS", "REJECTED", "CONSENSUS_SIMNET"],
      ["stranger-signs-v0", "PASS", "REJECTED", "CONSENSUS_SIMNET"],
      ["owner-right-guess-v1", "PASS", "ACCEPTED", "CONSENSUS_SIMNET"],
      ["runner-default-scenario", "NOT_REPRODUCIBLE", null, null]
    ]);
    expect(row("owner-right-guess-v0").txVersion).toBe(0);
    expect(row("owner-right-guess-v1").txVersion).toBe(1);
    expect(row("runner-default-scenario").notReproducible.code).toBe("RUNNER_DEFAULT_SCENARIO");
    expect(row("runner-default-scenario").coin).toBeUndefined();
    for (const name of ["owner-wrong-guess-v0", "stranger-signs-v0"]) {
      expect(row(name).nodeReason, name).toMatch(/signature script|script/i);
      expect(row(name).nodeReasonCode, name).toBe("SCRIPT_POLICY_REJECTED");
    }
    expect(rec.summary).toEqual({ total: 5, passed: 4, failed: 0, inconclusive: 0, notReproducible: 1, level: "CONSENSUS_SIMNET", casesAtLevel: 4 });
    expect(rec.status).toBe("INCOMPLETE");

    // the node, read by this test: each accepted spend's output is at bob and its coin gone; each refused coin is unspent
    const bobNow = await listed(BOB);
    const contractNow = await listed(contractAddress);
    for (const name of ["owner-right-guess-v0", "owner-right-guess-v1"]) {
      const x = row(name);
      expect(x.txId, name).toMatch(/^[0-9a-f]{64}$/);
      expect(x.effect, name).toBe("SPENT_IN_CHAIN");
      const out = bobNow.find((u) => u.txId === x.txId && u.index === 0);
      expect(out?.amountSompi, name).toBe(999_000_000n);
      expect(bobBefore.has(`${x.txId}:0`)).toBe(false);
      expect(contractNow.some((u) => u.txId === x.coin.outpoint.transactionId && u.index === x.coin.outpoint.index), name).toBe(false);
    }
    for (const name of ["owner-wrong-guess-v0", "stranger-signs-v0"]) {
      const x = row(name);
      expect(contractNow.some((u) => u.txId === x.coin.outpoint.transactionId && u.index === x.coin.outpoint.index && u.amountSompi === 1_000_000_000n), name).toBe(true);
      expect(bobNow.some((u) => u.txId === x.txId), name).toBe(false);
    }
    // the record is a sealed artifact on disk, where the node-evidenced Silver records go
    const onDisk = JSON.parse(fs.readFileSync(String(rec.recordPath), "utf8"));
    expect(onDisk.contentHash).toBe(rec.contentHash);
    expect(String(rec.recordPath).replace(/\\/g, "/")).toMatch(/\.hardkas\/artifacts\/silver\/silverNodeTest-/);
  });

  it("O-2 the node's verdict against the expectation fails the run: expects a pass and the node refuses; expects a failure and the node accepts", async () => {
    const tests = {
      tests: [
        { name: "expects-pass-node-refuses", function: "release", args: [{ signature: "alice" }, "7"], expect: "pass", tx: v0(1_000_000_000, 999_000_000) },
        { name: "expects-fail-node-accepts", function: "release", args: [{ signature: "alice" }, "42"], expect: "fail", tx: v0(1_000_000_000, 999_000_000) }
      ]
    };
    fs.writeFileSync(path.join(ws, "o2.test.json"), JSON.stringify(tests));
    const r = await hkMining(testArgs("o2.test.json"));
    const rec = r.json;
    evidence.runs.push({ id: "O-2", exit: r.status, record: rec });
    expect(rec?.schema, r.text).toBe("hardkas.silverNodeTest.v1");
    expect(r.status, r.text).toBe(1);
    expect(rec.results.map((x: any) => [x.name, x.outcome, x.nodeVerdict, x.verdictLevel])).toEqual([
      ["expects-pass-node-refuses", "FAIL", "REJECTED", "CONSENSUS_SIMNET"],
      ["expects-fail-node-accepts", "FAIL", "ACCEPTED", "CONSENSUS_SIMNET"]
    ]);
    expect(rec.summary).toEqual({ total: 2, passed: 0, failed: 2, inconclusive: 0, notReproducible: 0, level: "CONSENSUS_SIMNET", casesAtLevel: 2 });
    expect(rec.status).toBe("FAIL");
    const accepted = rec.results[1];
    expect((await listed(BOB)).some((u) => u.txId === accepted.txId && u.index === 0)).toBe(true);
  });
});
