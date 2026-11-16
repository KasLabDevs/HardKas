import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fundTestAccount, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForUtxo, type IsolatedSimnetSession } from "@hardkas/testing";
import { cliDist } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 600_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// R3-A3 · the covenant topologies beyond 1:1 FROM THE CLI, on a real rusty-kaspad v2.1.0 (the isolated simnet harness's
// own container). Until now 1:N, N:M and termination needed `hardkas silver engine plan` and a hand-written JSON of the
// SDK's options; `hardkas silver covenant start` (several outputs) and `hardkas silver covenant advance` (several inputs
// with a leader and delegates, several or no continuations) drive the same v1 engine. Every command is the built CLI in
// its own process; the node's answer is the verdict (accepted, mined, its outputs listed with the covenant id).
//
// The same contracts as the SDK's scenarios (packages/sdk/test/helpers/covenant-topologies-scenarios.ts, C1-C3):
// fixtures packages/accounts/test/fixtures/v1-engine/phase2 (upstream silverscript v1.0.0 covenant declarations).
// Needs Docker (the harness), HARDKAS_HOME with silverc and kaspa-wasm, and the built CLI (packages/cli/dist).
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const P2 = path.join(repoRoot, "packages", "accounts", "test", "fixtures", "v1-engine", "phase2");
const KEY_ENV = "HK_R3_TOPO_ALICE_KEY";

let session: IsolatedSimnetSession;
let parent = "";
let ws = "";
const trace: any[] = [];

interface Run {
  code: number | null;
  stdout: string;
  stderr: string;
  json: any;
}

const jsonDocs = (s: string) =>
  s
    .trim()
    .split(/\r?\n(?=\{)/)
    .map((chunk) => {
      try {
        return JSON.parse(chunk);
      } catch {
        return undefined;
      }
    })
    .filter((d) => d !== undefined);

function hk(args: string[], cwd = ws): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: { ...process.env, NO_COLOR: "1", [KEY_ENV]: session.minerPrivateKey }, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      const docs = jsonDocs(stdout);
      const run = { code, stdout, stderr, json: docs[docs.length - 1] };
      trace.push({ args, code, json: run.json, stderr: stderr.slice(0, 1500) });
      resolve(run);
    });
    child.stdin.end();
  });
}

const brief = (r: Run) => `exit ${r.code}\n${r.stdout.slice(0, 4000)}\n${r.stderr.slice(0, 2000)}`;
const errorCode = (r: Run) => (r.json?.ok === false ? r.json.code : r.json?.error?.code ?? r.json?.code);

const int = (n: number) => ({ kind: "int", value: n });
const b32 = (n: number) => ({ kind: "bytes", value: new Array(32).fill(n) });

function write(name: string, body: unknown): string {
  const file = path.join(ws, name);
  fs.writeFileSync(file, JSON.stringify(body));
  return file;
}

/** `hardkas silver compile` (the pinned silverc) of a phase-2 fixture with its constructor arguments. */
async function compile(name: string, ctor: unknown[]): Promise<{ record: string; args: string; address: string }> {
  fs.copyFileSync(path.join(P2, `${name}.sil`), path.join(ws, `${name}.sil`));
  const args = write(`${name}.args.json`, ctor);
  const r = await hk(["silver", "compile", `${name}.sil`, "--args", args, "--network", "simnet", "--json"]);
  expect(r.code, brief(r)).toBe(0);
  return { record: String(r.json.recordPath), args, address: String(r.json.contracts?.[0]?.address) };
}

/** Mines until `outpoint` is listed at `address`. */
async function confirm(address: string, outpoint: { transactionId: string; index: number }) {
  for (let round = 0; round < 8; round++) {
    await mineBlocks(session, 1);
    try {
      return await waitForUtxo(session, address, outpoint, 5_000);
    } catch {
      /* not yet in a block */
    }
  }
  throw new Error(`NOT_CONFIRMED: ${outpoint.transactionId}:${outpoint.index} at ${address}`);
}

const op = (s: string) => ({ transactionId: s.split(":")[0]!, index: Number(s.split(":")[1]) });
const kasOf = (sompi: string | bigint) => {
  const v = BigInt(sompi);
  return `${v / 100_000_000n}.${(v % 100_000_000n).toString().padStart(8, "0")}`;
};

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  await fundTestAccount(session, session.minerAddress, 1_000_000_000n);
  await mineBlocks(session, 20);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3-topo-cli-"));
  const init = await hk(["init", "app", "--network", "simnet", "--skip-toolchain", "--json"], parent);
  expect(init.code, brief(init)).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts: { alice: { kind: "kaspa", network: "simnet", address: session.minerAddress, privateKeyEnv: KEY_ENV } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
});

afterAll(async () => {
  const file = process.env.HARDKAS_TEST_R3_TOPOLOGIES_CLI_TRACE || path.join(os.tmpdir(), `silver-covenant-topologies-cli-${Date.now()}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify({ rpcUrl: session?.rpcUrl, containerName: session?.containerName, trace }, null, 2));
    console.log(`[silver-covenant-topologies-cli] trace written to ${file}`);
  } catch {
    /* the trace is a diagnostic */
  }
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("R3-A3 · `silver covenant start | advance` on a real rusty-kaspad (simnet harness)", () => {
  it("1:N · fanout (to = max_outs = 3): genesis, four continuations refused before signing, then 1 → 3 continuations accepted and mined, each output with the covenant id", async () => {
    const c = await compile("fanout", [int(3), int(10)]);
    const g = await hk(["silver", "covenant", "genesis", c.record, "--from", "alice", "--amount", "30", "--constructor-args", c.args, "--json"]);
    expect(g.code, brief(g)).toBe(0);
    const covenantId = String(g.json.covenantId);
    await confirm(String(g.json.address), { transactionId: String(g.json.txId), index: 0 });
    const v = (n: number) => write(`fanout-v${n}.json`, { value: int(n) });

    // four continuations: the declaration allows three; the engine refuses it, nothing is signed or sent
    const four = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "fanout", "--input", `${g.json.txId}:0`,
      "--next", v(1), "--next", `${v(1)}=5`, "--next", `${v(1)}=5`, "--next", `${v(1)}=5`, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(four.code, brief(four)).not.toBe(0);
    expect(errorCode(four), brief(four)).toBe("COVENANT_LINEAGE_INVALID");
    expect((await session.rpc.getUtxosByAddress(String(g.json.address))).some((u: any) => u.outpoint.transactionId === g.json.txId)).toBe(true);

    const a = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "fanout", "--input", `${g.json.txId}:0`,
      "--next", v(3), "--next", `${v(3)}=9`, "--next", `${v(4)}=9`, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(a.code, brief(a)).toBe(0);
    expect(a.json.schema).toBe("hardkas.silverCovenantAdvance.v1");
    expect(a.json.continuations.length).toBe(3);
    expect(a.json.terminated).toBe(false);
    expect(a.json.inputs.map((i: any) => i.role)).toEqual(["leader"]);
    for (const cont of a.json.continuations) {
      const u = await confirm(cont.address, op(cont.outpoint));
      expect(u.covenantId).toBe(covenantId);
    }
    expect(a.json.continuations.slice(1).map((x: any) => String(x.amountSompi))).toEqual(["900000000", "900000000"]);
    // the genesis output is spent
    expect((await session.rpc.getUtxosByAddress(String(g.json.address))).some((u: any) => u.outpoint.transactionId === g.json.txId)).toBe(false);
  });

  it("N:M · Matrix (max_ins = max_outs = 2): `start` with three outputs in three states, three inputs refused before signing, 2:2 (leader + delegate) accepted; again with --funder paying the fee", async () => {
    const c = await compile("matrix", [int(2), int(2), int(100), b32(7)]);
    const st = (amount: number, owner: number) => write(`matrix-${amount}-${owner}.json`, { amount: int(amount), owner: b32(owner) });
    const s = await hk([
      "silver", "covenant", "start", c.record, "--from", "alice", "--output", `${st(100, 7)}=20`, "--output", `${st(50, 8)}=10`, "--output", `${st(10, 9)}=5`,
      "--constructor-args", c.args, "--json"
    ]);
    expect(s.code, brief(s)).toBe(0);
    expect(s.json.schema).toBe("hardkas.silverCovenantStart.v1");
    const covenantId = String(s.json.covenantId);
    expect(s.json.outputs.length).toBe(3);
    for (const o of s.json.outputs) expect((await confirm(o.address, op(o.outpoint))).covenantId).toBe(covenantId);

    const leaderArgs = write("matrix-leader-args.json", [int(0)]);
    const three = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "step",
      "--input", s.json.outputs[0].outpoint, "--input", s.json.outputs[1].outpoint, "--input", s.json.outputs[2].outpoint,
      "--next", st(100, 7), "--next", `${st(50, 8)}=10`, "--next", `${st(10, 9)}=5`, "--args", leaderArgs, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(three.code, brief(three)).not.toBe(0);
    expect(errorCode(three), brief(three)).toBe("COVENANT_LINEAGE_INVALID");

    const two = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "step",
      "--input", s.json.outputs[0].outpoint, "--input", s.json.outputs[1].outpoint,
      "--next", st(100, 7), "--next", `${st(50, 8)}=10`, "--args", leaderArgs, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(two.code, brief(two)).toBe(0);
    expect(two.json.inputs.map((i: any) => [i.role, i.entry])).toEqual([["leader", "__leader_step"], ["delegate", "__delegate"]]);
    const next: any[] = [];
    for (const cont of two.json.continuations) {
      const u = await confirm(cont.address, op(cont.outpoint));
      expect(u.covenantId).toBe(covenantId);
      next.push({ ...cont, u });
    }

    // the same 2:2 again, the fee paid by a funder: the covenant keeps its whole value
    const funded = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "step", "--input", next[0].outpoint, "--input", next[1].outpoint,
      "--next", `${st(100, 7)}=${kasOf(next[0].amountSompi)}`, "--next", `${st(50, 8)}=${kasOf(next[1].amountSompi)}`,
      "--funder", "alice", "--args", leaderArgs, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(funded.code, brief(funded)).toBe(0);
    expect(funded.json.inputs.filter((i: any) => i.role === "fee").length).toBeGreaterThan(0);
    expect(funded.json.continuations.map((x: any) => String(x.amountSompi))).toEqual([String(next[0].amountSompi), String(next[1].amountSompi)]);
    for (const cont of funded.json.continuations) expect((await confirm(cont.address, op(cont.outpoint))).covenantId).toBe(covenantId);
  });

  it("termination · a singleton declaring termination = allowed: two continuations refused before signing; 1 → 1 accepted; then --terminate pays the value out, accepted, and no output of the covenant remains", async () => {
    const c = await compile("terminable", [int(100), b32(7)]);
    const st = (amount: number) => write(`terminable-${amount}.json`, { amount: int(amount), owner: b32(7) });
    const g = await hk(["silver", "covenant", "genesis", c.record, "--from", "alice", "--amount", "20", "--constructor-args", c.args, "--json"]);
    expect(g.code, brief(g)).toBe(0);
    const covenantId = String(g.json.covenantId);
    await confirm(String(g.json.address), { transactionId: String(g.json.txId), index: 0 });

    const two = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "step", "--input", `${g.json.txId}:0`,
      "--next", st(99), "--next", `${st(99)}=5`, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(two.code, brief(two)).not.toBe(0);
    expect(errorCode(two), brief(two)).toBe("COVENANT_LINEAGE_INVALID");

    const one = await hk(["silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "step", "--input", `${g.json.txId}:0`, "--next", st(99), "--compute-budget", "estimate", "--constructor-args", c.args, "--json"]);
    expect(one.code, brief(one)).toBe(0);
    const cont = one.json.continuations[0];
    expect((await confirm(cont.address, op(cont.outpoint))).covenantId).toBe(covenantId);

    const value = BigInt(cont.amountSompi);
    const end = await hk([
      "silver", "covenant", "advance", c.record, "--covenant", covenantId, "--policy", "step", "--input", cont.outpoint, "--terminate",
      "--pay", `alice=${kasOf(value - 1_000_000n)}`, "--compute-budget", "estimate", "--constructor-args", c.args, "--json"
    ]);
    expect(end.code, brief(end)).toBe(0);
    expect(end.json.terminated).toBe(true);
    expect(end.json.continuations).toEqual([]);
    expect(end.json.payments.map((p: any) => [p.address, String(p.amountSompi)])).toEqual([[session.minerAddress, String(value - 1_000_000n)]]);
    const paid = await confirm(session.minerAddress, op(end.json.payments[0].outpoint));
    expect(paid.covenantId).toBeUndefined();
    const left = (await session.rpc.getUtxosByAddress(cont.address)).filter((u: any) => u.outpoint.transactionId === op(cont.outpoint).transactionId);
    expect(left).toEqual([]);
    // the lineage the CLI reads back: genesis, two transitions, nothing at the tip
    const inspect = await hk(["silver", "covenant", "inspect", covenantId, "--json"]);
    expect(inspect.code, brief(inspect)).toBe(0);
    expect(inspect.json.transitions.length).toBe(2);
    expect(inspect.json.tip).toEqual([]);
  });
});
