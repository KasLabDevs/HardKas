import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { KASPAD_REFERENCE_IMAGE, getSilContract, loadManagedKaspaWasmSync, parseSilAbiArtifact, silContractBytecodeHex, silverP2shAddress } from "@hardkas/core";
import { fundTestAccount, getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForUtxo, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// R3-F · CLTV on the v1 engine and on `hardkas silver spend`, against a real rusty-kaspad v2.1.0 (isolated simnet, the
// harness's own container). The contract requires `tx.daa >= unlockDaa` (OpCheckLockTimeVerify); every transaction is
// built by HardKAS (sdk.covenants.planContractSpend / sign / send, the built CLI's `silver compile | deploy | spend`) and
// the node decides. Raw submissions are the test's probes of the node's rule, never HardKAS's send path.
//
//   V-1 SDK v1 engine: no lock, a time lock and a lock below unlockDaa refused before anything is planned (the entry's
//       statement read from the AST, its value from the constructor arguments); the plan with lockTime { daaScore:
//       unlockDaa } signed; sent too early: LOCK_TIME_NOT_REACHED, nothing recorded (the node: "not finalized"); once the
//       lock is passed the node refuses the three wrong locks HardKAS refused (v1 probes: "mismatched locktime types",
//       "locktime requirement not satisfied") and accepts the same signed transaction, mined, the value at the recipient
//   V-2 SDK covenant transition (planTransition) whose policy requires `tx.daa >= deadline`: no lock and a time lock
//       refused before planning (the leader's policy read from the AST); too early: LOCK_TIME_NOT_REACHED, nothing
//       recorded; once the deadline passed the node refuses lock 0 (the policy's CLTV runs through the generated leader
//       entry) and accepts the planned transition, its continuation keeping the covenant id
//   C-0 CLI `silver spend` (transaction v0) --lock-time-ms: LOCK_TIME_KIND_MISMATCH before the node; both options:
//       LOCK_TIME_INVALID; no lock: the node refuses (v0 has no constructor values, so HardKAS cannot know x: the node's
//       lock-0 refusal); --lock-time-daa unlockDaa too early: LOCK_TIME_NOT_REACHED, no record, the output unspent; on
//       time: spent, the record carries lockTime, mined
//   C-1 CLI `silver spend --tx-version 1`: a lock below unlockDaa refused before signing; too early: LOCK_TIME_NOT_REACHED,
//       no submission, no record; on time: spent, the record carries lockTime and txVersion 1, mined
//
// Evidence: a JSON written to HARDKAS_TEST_CLTV_V1_EVIDENCE (or the OS temp directory).
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const KEY_ENV = "HK_R3F_CLTV_ALICE_KEY";

let session: IsolatedSimnetSession;
let sdk: Hardkas;
let parent = "";
let ws = "";
let k: any;
let BOB = "";
let ALICE_XONLY: number[] = [];
const evidence: Record<string, any> = { schema: "hardkas.r3.cltvV1EngineCliNode.v1", startedAt: new Date().toISOString(), node: {}, vectors: [] as any[] };
const record = (v: Record<string, unknown>) => (evidence.vectors.push(v), v);
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

const SOURCE = `pragma silverscript ^0.1.0;

contract AbsoluteDaaLock(pubkey owner, int unlockDaa) {
    entry claim(sig ownerSig) {
        require(tx.daa >= unlockDaa);
        require(checkSig(ownerSig, owner));
    }
}
`;

interface Run {
  status: number | null;
  json: any;
  text: string;
}

function hk(args: string[], cwd = ws): Run {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: { ...process.env, NO_COLOR: "1", [KEY_ENV]: session.minerPrivateKey }, timeout: 600_000, windowsHide: true });
  const docs = String(r.stdout ?? "")
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
  return { status: r.status, json: docs[docs.length - 1], text: `${r.stdout}\n${r.stderr}`.slice(0, 4000) };
}
const codeOfRun = (r: Run) => (r.json?.ok === false ? r.json.code : r.json?.error?.code ?? r.json?.code);

async function submit(rpcTx: unknown): Promise<{ accepted: boolean; reason?: string }> {
  try {
    const res: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false });
    return { accepted: res?.accepted !== false, ...(res?.error ? { reason: String(res.error) } : {}) };
  } catch (e: any) {
    return { accepted: false, reason: String(e?.message ?? e).slice(0, 600) };
  }
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; code: string; message: string }> {
  try {
    return { ok: true, value: await p };
  } catch (e: any) {
    return { ok: false, code: String(e?.code ?? "UNCODED"), message: String(e?.message ?? e).slice(0, 600) };
  }
}
const verdict = (s: Awaited<ReturnType<typeof settle>>) => (s.ok ? "PASSED" : (s as any).code);

async function confirm(address: string, outpoint: { transactionId: string; index: number }) {
  for (let round = 0; round < 8; round++) {
    await mineBlocks(session, 1);
    try {
      return await waitForUtxo(session, address, outpoint, 5_000);
    } catch {
      /* not yet */
    }
  }
  throw new Error(`NOT_CONFIRMED: ${outpoint.transactionId}:${outpoint.index} at ${address}`);
}

async function dagPoint(): Promise<{ virtualDaaScore: bigint; pastMedianTimeMs: bigint }> {
  const raw: any = await session.rpc.call("getBlockDagInfo", {});
  const d = raw?.getBlockDagInfoResponse ?? raw;
  return { virtualDaaScore: BigInt(d.virtualDaaScore), pastMedianTimeMs: BigInt(d.pastMedianTime) };
}

async function mineTo(target: bigint): Promise<bigint> {
  for (let guard = 0; guard < 5000; guard++) {
    const v = (await dagPoint()).virtualDaaScore;
    if (v >= target) return v;
    await mineBlocks(session, Number(target - v > 200n ? 200n : target - v));
  }
  throw new Error("mineTo: no progress");
}

function filesUnder(dir: string, test: (name: string) => boolean): number {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) n += filesUnder(path.join(dir, e.name), test);
    else if (test(e.name)) n += 1;
  }
  return n;
}
const submissionsIn = () => filesUnder(path.join(ws, ".hardkas"), (f) => /txsubmission/i.test(f));
const spendRecordsIn = () => filesUnder(ws, (f) => /^silverSpend/i.test(f));
const artifactsIn = () => filesUnder(path.join(ws, ".hardkas"), () => true);

const rpcOf = (signed: any) => {
  let tx: any = JSON.parse(signed.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};

/**
 * A node probe: the same v1 plan sealed with another lock time (or none), signed by the engine and submitted raw by the
 * test (never by HardKAS's send). The planner's lock-time check is the thing under test elsewhere, so the probe seals the
 * body directly (sdk.covenants.plan).
 */
async function probeWithLockTime(plan: any, from: string, lockTime: unknown, opts: { compileRecords: any[] }) {
  const keep = ["txVersion", "inputs", "outputs", "genesisCovenantGroups", "payload", "estimatedFeeSompi", "estimatedMass", "storageMass", "maxFeeSompi", "covenantOutpoints", "nextState"];
  const body: any = Object.fromEntries(keep.filter((f) => plan[f] !== undefined).map((f) => [f, plan[f]]));
  if (lockTime !== undefined) body.lockTime = lockTime;
  const p = await sdk.covenants.plan({ body, from: { address: from }, purpose: "R3-F node probe" });
  const signed = (await sdk.covenants.sign(p, opts)).signed;
  return submit(rpcOf(signed));
}

const isUnspent = async (address: string, outpoint: { transactionId: string; index: number }) =>
  (await session.rpc.getUtxosByAddress(address)).some((u: any) => String(u.outpoint.transactionId).toLowerCase() === outpoint.transactionId.toLowerCase() && Number(u.outpoint.index) === outpoint.index);

/** `silver compile` (the pinned silverc) and `silver deploy` (v0 funding) of the contract with its own unlockDaa. */
async function deployed(tag: string, unlockDaa: bigint, amountKas = "20") {
  const ctor = [{ kind: "bytes", value: ALICE_XONLY }, { kind: "int", value: Number(unlockDaa) }];
  fs.writeFileSync(path.join(ws, `${tag}.sil`), SOURCE);
  const ctorFile = path.join(ws, `${tag}.ctor.json`);
  fs.writeFileSync(ctorFile, JSON.stringify(ctor));
  const c = hk(["silver", "compile", `${tag}.sil`, "--args", ctorFile, "--network", "simnet", "--json"]);
  expect(c.status, c.text).toBe(0);
  const compileRecordPath = path.resolve(ws, String(c.json.recordPath));
  const compileRecord = JSON.parse(fs.readFileSync(compileRecordPath, "utf8"));
  const bytecode = silContractBytecodeHex(getSilContract(parseSilAbiArtifact(JSON.parse(compileRecord.artifactJson))).contract);
  const address = silverP2shAddress(bytecode, "simnet");
  const d = hk(["silver", "deploy", compileRecordPath, "--from", "alice", "--amount", amountKas, "--json"]);
  expect(d.status, d.text).toBe(0);
  expect(d.json.address).toBe(address);
  const outpoint = { transactionId: String(d.json.txId).toLowerCase(), index: 0 };
  await confirm(address, outpoint);
  return { compileRecord, compileRecordPath, ctorFile, deployRecordPath: path.resolve(ws, String(d.json.recordPath)), address, outpoint };
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  BOB = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
  ALICE_XONLY = [...Buffer.from(String(new k.PrivateKey(session.minerPrivateKey).toPublicKey().toXOnlyPublicKey().toString()), "hex")];
  const info: any = await session.rpc.getServerInfo();
  evidence.node = { rpcUrl: session.rpcUrl, containerName: session.containerName, image: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE, serverVersion: info.serverVersion, networkId: info.networkId };
  await fundTestAccount(session, session.minerAddress, 2_000_000_000n);
  await mineBlocks(session, 30);

  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r3f-cltv-"));
  const init = hk(["init", "app", "--network", "simnet", "--skip-toolchain", "--json"], parent);
  expect(init.status, init.text).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } },
    accounts: { alice: { kind: "kaspa", network: "simnet", address: session.minerAddress, privateKeyEnv: KEY_ENV } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  process.env[KEY_ENV] = session.minerPrivateKey;
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  const file = process.env.HARDKAS_TEST_CLTV_V1_EVIDENCE || path.join(os.tmpdir(), `cltv-v1-engine-cli-node-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json(evidence), null, 2));
    console.log(`[cltv-v1-engine-cli-node] evidence written to ${file}`);
  } catch {
    /* diagnostic */
  }
  delete process.env[KEY_ENV];
  await sdk?.close?.();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("R3-F · CLTV on the v1 engine (sdk.covenants.planContractSpend) against rusty-kaspad", () => {
  it("V-1 refused before planning when the lock cannot meet tx.daa >= unlockDaa; too early refused before the broadcast; the node agrees on every refusal; on time accepted and mined", async () => {
    const unlockDaa = (await dagPoint()).virtualDaaScore + 150n;
    const c = await deployed("v1lock", unlockDaa);
    const ref = { contentHash: String(c.compileRecord.contentHash), artifactSha256: String(c.compileRecord.provenance.artifactSha256) };
    const contract = {
      compileRecord: ref,
      contract: "AbsoluteDaaLock",
      constructorArgs: [{ kind: "bytes" as const, value: ALICE_XONLY }, { kind: "int" as const, value: unlockDaa.toString() }],
      entry: "claim",
      args: [{ kind: "signer" as const, signer: "alice" }]
    };
    const opts = { compileRecords: [c.compileRecord] };
    const spend = (lockTime?: any) =>
      sdk.covenants.planContractSpend({ outpoint: c.outpoint, contract, payments: [], sweepTo: BOB, computeBudget: "estimate", ...(lockTime !== undefined ? { lockTime } : {}) }, opts);

    // refused before anything is planned: the entry's statement (AST) and unlockDaa (constructor arguments)
    const storedBefore = artifactsIn();
    const pmt = (await dagPoint()).pastMedianTimeMs;
    const none = await settle(spend());
    const timeLock = await settle(spend({ timestampMs: pmt }));
    const below = await settle(spend({ daaScore: unlockDaa - 1n }));
    const storedAfterRefusals = artifactsIn() - storedBefore;

    // the plan HardKAS accepts: lockTime { daaScore: unlockDaa }, recorded with the node's position
    const plan: any = await spend({ daaScore: unlockDaa });
    expect(plan.lockTime.daaScore).toBe(unlockDaa.toString());
    expect(BigInt(plan.lockTime.observedAt.virtualDaaScore)).toBeLessThan(unlockDaa);
    const s = await sdk.covenants.sign(plan, opts);
    const rpcTx = rpcOf(s.signed);
    expect(String(rpcTx.lockTime)).toBe(unlockDaa.toString());
    expect(rpcTx.inputs.every((i: any) => BigInt(i.sequence ?? 0) === 0n)).toBe(true);

    const submittedBefore = submissionsIn();
    const early = await settle(sdk.covenants.send(s.signed, opts));
    const earlyNode = await submit(rpcTx);
    const recordedEarly = submissionsIn() - submittedBefore;
    const unspentAfterEarly = await isUnspent(c.address, c.outpoint);

    // the lock passed: the node itself refuses the three locks HardKAS refused (v1 probes, signed by the engine from a plan
    // sealed with the other lock time; never sent by HardKAS)
    const after = await mineTo(unlockDaa + 1n);
    const variant = (lockTime: any) => probeWithLockTime(plan, c.address, lockTime, opts);
    const pmtNow = (await dagPoint()).pastMedianTimeMs;
    const noneNode = await variant(undefined);
    const timeNode = await variant({ timestampMs: (pmtNow - 1n).toString() });
    const belowNode = await variant({ daaScore: (unlockDaa - 1n).toString() });

    const sent = await settle(sdk.covenants.send(s.signed, opts));
    const ok = sent.ok && (sent.value as any)?.submitted !== false && (sent.value as any)?.rejection === undefined;
    const out = ok ? await confirm(BOB, { transactionId: String(s.txId).toLowerCase(), index: 0 }) : undefined;
    record({
      id: "V-1",
      vector: "v1 engine contract spend, tx.daa >= unlockDaa",
      hardkas: { unlockDaa, none: verdict(none), timeLock: verdict(timeLock), below: verdict(below), storedOnRefusal: storedAfterRefusals, txId: s.txId, earlySend: verdict(early), recordedEarly },
      node: { early: earlyNode, afterLock: { virtual: after, noLock: noneNode, timeLock: timeNode, below: belowNode, sent: { accepted: ok, mined: Boolean(out), ...(ok ? {} : { reason: JSON.stringify(sent) }) } } },
      agree:
        verdict(none) === "LOCK_TIME_BELOW_ENTRY_REQUIREMENT" && verdict(timeLock) === "LOCK_TIME_KIND_MISMATCH" && verdict(below) === "LOCK_TIME_BELOW_ENTRY_REQUIREMENT" &&
        verdict(early) === "LOCK_TIME_NOT_REACHED" && !earlyNode.accepted && !noneNode.accepted && !timeNode.accepted && !belowNode.accepted && ok && Boolean(out)
    });
    expect(verdict(none)).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(verdict(timeLock)).toBe("LOCK_TIME_KIND_MISMATCH");
    expect(verdict(below)).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(storedAfterRefusals, "nothing planned or stored on a refusal").toBe(0);
    expect(verdict(early)).toBe("LOCK_TIME_NOT_REACHED");
    expect(recordedEarly, "nothing recorded before the lock").toBe(0);
    expect(unspentAfterEarly).toBe(true);
    expect(earlyNode.accepted, earlyNode.reason).toBe(false);
    expect(earlyNode.reason).toMatch(/not finalized/);
    expect(noneNode.accepted, noneNode.reason).toBe(false);
    expect(noneNode.reason).toMatch(/locktime requirement not satisfied/);
    expect(timeNode.accepted, timeNode.reason).toBe(false);
    expect(timeNode.reason).toMatch(/mismatched locktime types/);
    expect(belowNode.accepted, belowNode.reason).toBe(false);
    expect(belowNode.reason).toMatch(/locktime requirement not satisfied/);
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(String((sent as any).value?.txId ?? "").toLowerCase()).toBe(String(s.txId).toLowerCase());
    expect(out?.amountSompi).toBe(BigInt(plan.outputs[0].amountSompi));
  });
});

const DEADLINE_SOURCE = `pragma silverscript ^0.1.0;

contract DeadlineCounter(int deadline, int init_value) {
    int value = init_value;

    #[covenant.singleton(mode = transition, termination = allowed)]
    function step(State prev_state, State[] next_states) : (State[]) {
        require(tx.daa >= deadline);
        return(next_states);
    }
}
`;

describe("R3-F · CLTV on a covenant transition (sdk.covenants.planTransition) against rusty-kaspad", () => {
  it("V-2 a policy that requires tx.daa >= deadline: no lock and a time lock refused before planning; too early refused before the broadcast; the node refuses lock 0 once the deadline passed and accepts the planned transition, the continuation keeping the covenant id", async () => {
    const deadline = (await dagPoint()).virtualDaaScore + 150n;
    const ctor = [{ kind: "int", value: Number(deadline) }, { kind: "int", value: 10 }];
    fs.writeFileSync(path.join(ws, "deadline.sil"), DEADLINE_SOURCE);
    const ctorFile = path.join(ws, "deadline.ctor.json");
    fs.writeFileSync(ctorFile, JSON.stringify(ctor));
    const compiled = hk(["silver", "compile", "deadline.sil", "--args", ctorFile, "--network", "simnet", "--json"]);
    expect(compiled.status, compiled.text).toBe(0);
    const compileRecord = JSON.parse(fs.readFileSync(path.resolve(ws, String(compiled.json.recordPath)), "utf8"));
    const opts = { compileRecords: [compileRecord] };
    const contractRef = {
      compileRecord: { contentHash: String(compileRecord.contentHash), artifactSha256: String(compileRecord.provenance.artifactSha256) },
      contract: "DeadlineCounter",
      constructorArgs: [{ kind: "int" as const, value: deadline.toString() }, { kind: "int" as const, value: "10" }]
    };

    // the covenant's genesis (P2PK funder coins: no lock time involved)
    const genesisPlan: any = await sdk.covenants.planGenesis({ contract: contractRef, outputs: [{ amountSompi: 2_000_000_000n }], funder: "alice" }, opts);
    const genesis = await sdk.covenants.sign(genesisPlan, opts);
    const covenantId = String(rpcOf(genesis.signed).outputs[0].covenant.covenantId).toLowerCase();
    const genesisSent = await settle(sdk.covenants.send(genesis.signed, opts));
    expect(genesisSent.ok, JSON.stringify(genesisSent)).toBe(true);
    const covenantAddress = String(genesisPlan.outputs[0].address);
    const outpoint = { transactionId: String(genesis.txId).toLowerCase(), index: 0 };
    const held = await confirm(covenantAddress, outpoint);
    expect(String(held.covenantId ?? "").toLowerCase()).toBe(covenantId);

    // the leader's generated entry of policy `step`, its State[] parameter the next states
    const contract = getSilContract(parseSilAbiArtifact(JSON.parse(compileRecord.artifactJson))).contract as any;
    const entry = String(contract.cov_decl_to_abi.step);
    const next = { value: { kind: "int" as const, value: "11" } };
    const args = (contract.entries[entry].params as any[]).map((p) => {
      const t = p.type;
      if ((t?.kind === "dynamic_array" || t?.kind === "fixed_array") && t.item?.kind === "struct" && t.item.name === "State") return { kind: "array", value: [{ kind: "object", value: next }] };
      if (t?.kind === "struct" && t.name === "State") return { kind: "object", value: next };
      throw new Error(`unexpected parameter ${p.name} of ${entry}`);
    });
    const transition = (lockTime?: any) =>
      sdk.covenants.planTransition(
        {
          covenantId,
          inputs: [{ outpoint, contract: { ...contractRef, entry, policy: "step", args: args as any }, computeBudget: "estimate" }],
          continuations: [{ amountSompi: "rest", state: next }],
          ...(lockTime !== undefined ? { lockTime } : {})
        },
        opts
      );

    const storedBefore = artifactsIn();
    const none = await settle(transition());
    const timeLock = await settle(transition({ timestampMs: (await dagPoint()).pastMedianTimeMs }));
    const storedOnRefusal = artifactsIn() - storedBefore;
    const plan: any = await transition({ daaScore: deadline });
    expect(plan.lockTime.daaScore).toBe(deadline.toString());
    const s = await sdk.covenants.sign(plan, opts);
    const rpcTx = rpcOf(s.signed);
    expect(String(rpcTx.lockTime)).toBe(deadline.toString());

    const submittedBefore = submissionsIn();
    const early = await settle(sdk.covenants.send(s.signed, opts));
    const earlyNode = await submit(rpcTx);
    const recordedEarly = submissionsIn() - submittedBefore;
    const after = await mineTo(deadline + 1n);
    const noneNode = await probeWithLockTime(plan, String(plan.from?.address ?? covenantAddress), undefined, opts);
    const sent = await settle(sdk.covenants.send(s.signed, opts));
    const ok = sent.ok && (sent.value as any)?.submitted !== false && (sent.value as any)?.rejection === undefined;
    const cont = ok ? await confirm(String(plan.outputs[0].address), { transactionId: String(s.txId).toLowerCase(), index: 0 }) : undefined;
    record({
      id: "V-2",
      vector: "v1 covenant transition, policy requires tx.daa >= deadline",
      hardkas: { deadline, covenantId, none: verdict(none), timeLock: verdict(timeLock), storedOnRefusal, txId: s.txId, earlySend: verdict(early), recordedEarly },
      node: { early: earlyNode, afterDeadline: { virtual: after, noLock: noneNode, sent: { accepted: ok, mined: Boolean(cont), covenantId: cont?.covenantId, ...(ok ? {} : { reason: JSON.stringify(sent) }) } } },
      agree:
        verdict(none) === "LOCK_TIME_BELOW_ENTRY_REQUIREMENT" && verdict(timeLock) === "LOCK_TIME_KIND_MISMATCH" && verdict(early) === "LOCK_TIME_NOT_REACHED" && recordedEarly === 0 &&
        !earlyNode.accepted && !noneNode.accepted && ok && String(cont?.covenantId ?? "").toLowerCase() === covenantId
    });
    expect(verdict(none)).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(verdict(timeLock)).toBe("LOCK_TIME_KIND_MISMATCH");
    expect(storedOnRefusal).toBe(0);
    expect(verdict(early)).toBe("LOCK_TIME_NOT_REACHED");
    expect(recordedEarly).toBe(0);
    expect(earlyNode.accepted, earlyNode.reason).toBe(false);
    expect(earlyNode.reason).toMatch(/not finalized/);
    expect(noneNode.accepted, noneNode.reason).toBe(false);
    expect(noneNode.reason).toMatch(/locktime requirement not satisfied/);
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(String(cont?.covenantId ?? "").toLowerCase()).toBe(covenantId);
  });
});

describe("R3-F · CLTV through the built CLI `silver spend` against rusty-kaspad", () => {
  it("C-0 transaction v0: a time lock refused before the node; both options refused; no lock refused by the node; too early refused before the broadcast with nothing recorded; on time spent and recorded", async () => {
    const unlockDaa = (await dagPoint()).virtualDaaScore + 120n;
    const c = await deployed("v0lock", unlockDaa);
    const argsFile = path.join(ws, "v0lock.args.json");
    fs.writeFileSync(argsFile, JSON.stringify([{ kind: "signature", account: "alice" }]));
    const base = ["silver", "spend", c.deployRecordPath, "--entry", "claim", "--to", BOB, "--args", argsFile, "--json"];
    const spendsBefore = spendRecordsIn();
    const pmt = (await dagPoint()).pastMedianTimeMs;
    const kind = hk([...base, "--lock-time-ms", String(pmt)]);
    const both = hk([...base, "--lock-time-daa", String(unlockDaa), "--lock-time-ms", String(pmt)]);
    const noLock = hk(base);
    const early = hk([...base, "--lock-time-daa", String(unlockDaa)]);
    const recordedEarly = spendRecordsIn() - spendsBefore;
    const unspentAfterEarly = await isUnspent(c.address, c.outpoint);
    const after = await mineTo(unlockDaa + 1n);
    const onTime = hk([...base, "--lock-time-daa", String(unlockDaa)]);
    const out = onTime.status === 0 ? await confirm(BOB, { transactionId: String(onTime.json.txId).toLowerCase(), index: 0 }) : undefined;
    record({
      id: "C-0",
      vector: "CLI silver spend (v0) --lock-time-daa / --lock-time-ms",
      hardkas: { unlockDaa, kind: [kind.status, codeOfRun(kind)], both: [both.status, codeOfRun(both)], noLock: [noLock.status, codeOfRun(noLock), noLock.text.slice(0, 600)], early: [early.status, codeOfRun(early)], recordedEarly, onTime: [onTime.status, onTime.json?.lockTime] },
      node: { afterLock: after, onTime: { mined: Boolean(out) } },
      agree: kind.status === 2 && codeOfRun(kind) === "LOCK_TIME_KIND_MISMATCH" && codeOfRun(both) === "LOCK_TIME_INVALID" && codeOfRun(noLock) === "SILVER_REJECTED_BY_NODE" && codeOfRun(early) === "LOCK_TIME_NOT_REACHED" && recordedEarly === 0 && onTime.status === 0 && Boolean(out)
    });
    expect(kind.status, kind.text).toBe(2);
    expect(codeOfRun(kind), kind.text).toBe("LOCK_TIME_KIND_MISMATCH");
    expect(both.status, both.text).toBe(2);
    expect(codeOfRun(both), both.text).toBe("LOCK_TIME_INVALID");
    expect(noLock.status, noLock.text).not.toBe(0);
    expect(codeOfRun(noLock), noLock.text).toBe("SILVER_REJECTED_BY_NODE");
    expect(noLock.text).toMatch(/locktime requirement not satisfied/);
    expect(early.status, early.text).not.toBe(0);
    expect(codeOfRun(early), early.text).toBe("LOCK_TIME_NOT_REACHED");
    expect(recordedEarly).toBe(0);
    expect(unspentAfterEarly).toBe(true);
    expect(onTime.status, onTime.text).toBe(0);
    expect(onTime.json.lockTime).toBe(unlockDaa.toString());
    expect(onTime.json.sequence).toBe("0");
    expect(out?.amountSompi).toBe(BigInt(onTime.json.outputSompi));
  });

  it("C-1 --tx-version 1: a lock below unlockDaa refused before signing; too early refused before the broadcast, nothing recorded; on time spent, the record carries lockTime", async () => {
    const unlockDaa = (await dagPoint()).virtualDaaScore + 120n;
    const c = await deployed("v1cli", unlockDaa);
    const argsFile = path.join(ws, "v1cli.args.json");
    fs.writeFileSync(argsFile, JSON.stringify([{ kind: "signature", account: "alice" }]));
    const base = ["silver", "spend", c.deployRecordPath, "--entry", "claim", "--to", BOB, "--args", argsFile, "--tx-version", "1", "--constructor-args", c.ctorFile, "--json"];
    const spendsBefore = spendRecordsIn();
    const submittedBefore = submissionsIn();
    const below = hk([...base, "--lock-time-daa", String(unlockDaa - 1n)]);
    const early = hk([...base, "--lock-time-daa", String(unlockDaa)]);
    const recordedEarly = spendRecordsIn() - spendsBefore;
    const submittedEarly = submissionsIn() - submittedBefore;
    const unspentAfterEarly = await isUnspent(c.address, c.outpoint);
    const after = await mineTo(unlockDaa + 1n);
    const onTime = hk([...base, "--lock-time-daa", String(unlockDaa)]);
    const out = onTime.status === 0 ? await confirm(BOB, { transactionId: String(onTime.json.txId).toLowerCase(), index: 0 }) : undefined;
    record({
      id: "C-1",
      vector: "CLI silver spend --tx-version 1 --lock-time-daa",
      hardkas: { unlockDaa, below: [below.status, codeOfRun(below)], early: [early.status, codeOfRun(early)], recordedEarly, submittedEarly, onTime: [onTime.status, onTime.json?.lockTime, onTime.json?.txVersion] },
      node: { afterLock: after, onTime: { mined: Boolean(out) } },
      agree: below.status === 2 && codeOfRun(below) === "LOCK_TIME_BELOW_ENTRY_REQUIREMENT" && codeOfRun(early) === "LOCK_TIME_NOT_REACHED" && recordedEarly === 0 && submittedEarly === 0 && onTime.status === 0 && Boolean(out)
    });
    expect(below.status, below.text).toBe(2);
    expect(codeOfRun(below), below.text).toBe("LOCK_TIME_BELOW_ENTRY_REQUIREMENT");
    expect(early.status, early.text).not.toBe(0);
    expect(codeOfRun(early), early.text).toBe("LOCK_TIME_NOT_REACHED");
    expect(recordedEarly).toBe(0);
    expect(submittedEarly).toBe(0);
    expect(unspentAfterEarly).toBe(true);
    expect(onTime.status, onTime.text).toBe(0);
    expect(onTime.json.lockTime).toBe(unlockDaa.toString());
    expect(onTime.json.txVersion).toBe(1);
    expect(out?.amountSompi).toBe(BigInt(onTime.json.outputSompi));
  });
});

describe("R3-F · summary", () => {
  it("every vector agrees with the node", () => {
    const off = (evidence.vectors as any[]).filter((v) => v.agree !== true);
    expect(off, JSON.stringify(json(off), null, 2)).toEqual([]);
  });
});
