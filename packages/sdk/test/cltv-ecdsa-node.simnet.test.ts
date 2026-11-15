import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  KASPAD_REFERENCE_IMAGE,
  compileSilverScript,
  ecdsaCompressedPublicKey,
  getSilContract,
  kaspaSighashInputsFromWasm,
  loadManagedKaspaWasmSync,
  signKaspaInputEcdsa,
  silContractBytecodeHex,
  silverP2shAddress,
  silverP2shLock,
  systemRuntimeContext,
  verifyKaspaInputSignatureEcdsa
} from "@hardkas/core";
import { createTxPlanArtifact, expectedScriptPublicKeyHex, finalizeTxPlanIdentity } from "@hardkas/artifacts";
import {
  MAX_TX_IN_SEQUENCE_NUM,
  TxPlanService,
  assertPayloadLockTimeReached,
  calculateUpstreamStorageMass,
  v1FeeMass,
  v1MinimumRelayFee,
  v1NonContextualMasses
} from "@hardkas/tx-builder";
import { EcdsaPrivateKeyAuthorizer, PrivateKeyAuthorizer, buildScriptFunding, buildSilverSweep, parseWasmTxToRpc } from "@hardkas/accounts";
import { fundTestAccount, getHardkasFixtureKey, mineBlocks, startIsolatedSimnet, stopIsolatedSimnet, waitForUtxo, type IsolatedSimnetSession } from "../../testing/src/index.js";
import { Hardkas, PAYMENT_PREFLIGHT_GUARANTEE_ECDSA } from "../src/index.js";

vi.setConfig({ testTimeout: 900_000, hookTimeout: 900_000 });

// -----------------------------------------------------------------------------
// CLTV + ECDSA spends against a real rusty-kaspad v2.1.0 (isolated simnet, the harness's own container). Every
// transaction is built by HardKAS — the SDK's payment planner, signer and send (sdk.tx.plan / sign / send), the accounts
// SilverScript sweep (buildSilverSweep) and the ECDSA signer — and the node decides. Raw submissions here are the test's
// probes of the node's rule (one byte off, high-S, too early), never HardKAS's send path.
//
//   L-1 payment, DAA-score lock: refused by HardKAS's send before the broadcast and by the node (before and at the lock);
//       the same transaction sent once the virtual DAA score passes it, accepted and mined
//   L-2 the finality rule: every input at the maximum sequence makes the lock void (accepted early); at sequence 0 refused
//   L-3 payment, time lock: refused far ahead (HardKAS and node); at the past median time refused, accepted once it passes
//   S-1 SilverScript `require(tx.daa >= unlockDaa)` (OpCheckLockTimeVerify): too early (not final) refused; a lock time
//       below the script's value refused by the script; a time lock (other kind) refused; on time accepted and mined
//   E-1 ECDSA account: funded, its payment planned, signed with ECDSA and sent, accepted, the exact value at the recipient;
//       one byte off, the high-S twin and a Schnorr signature refused; one sompi under the fee floor refused
//   E-2 mixed Schnorr + ECDSA inputs in one transaction, each signed with its own scheme, accepted
//
// Evidence: a JSON written to HARDKAS_TEST_CLTV_ECDSA_EVIDENCE (or the OS temp directory).
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const cliDist = path.join(repoRoot, "packages", "cli", "dist", "index.js");
const PW_ENV = "HK_CLTV_ECDSA_PW";
const PASSWORD = `cltv-ecdsa-${process.pid}`;
const CAROL_KEY = "5e".repeat(32); // a test-only key, generated for this suite

let session: IsolatedSimnetSession;
let sdk: Hardkas;
let parent = "";
let ws = "";
let k: any;
let ALICE = "";
let ALICE_KEY = "";
let BOB = "";
let CAROL_ECDSA = "";
const evidence: Record<string, any> = { schema: "hardkas.r3.cltvEcdsaNode.v1", startedAt: new Date().toISOString(), node: {}, vectors: [] as any[] };
const record = (v: Record<string, unknown>) => (evidence.vectors.push(v), v);
const json = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

async function submit(rpcTx: unknown): Promise<{ accepted: boolean; reason?: string; txId?: string }> {
  try {
    const res: any = await session.rpc.submitTransaction(rpcTx as any, { allowOrphan: false });
    return { accepted: res?.accepted !== false, ...(res?.error ? { reason: String(res.error) } : {}), ...(res?.transactionId ? { txId: String(res.transactionId).toLowerCase() } : {}) };
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

const accepted = (sent: Awaited<ReturnType<typeof settle>>) => sent.ok && (sent.value as any)?.submitted !== false && (sent.value as any)?.rejection === undefined;

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

const submissionsIn = () => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)).length : 0;
};

const rpcOf = (signed: any) => {
  let tx: any = JSON.parse(signed.signedTransaction.payload);
  while (typeof tx === "string") tx = JSON.parse(tx);
  return tx;
};

/** HardKAS's own relay minimum of a v0 transaction with these inputs (65-byte signature push) and output script sizes. */
function v0Minimum(inputs: number, outputScriptBytes: number[]): bigint {
  return v1MinimumRelayFee(
    v1FeeMass(
      v1NonContextualMasses({
        version: 0,
        inputs: Array.from({ length: inputs }, () => ({ signatureScriptBytes: 66, sigOpCount: 1 })),
        outputs: outputScriptBytes.map((b) => ({ scriptBytes: b, covenant: false })),
        payloadBytes: 0
      })
    )
  );
}

/** A v0 transaction over node UTXO entries (kaspa-wasm), for the node probes. */
function wasmTx(entries: any[], outputs: Array<{ value: bigint; scriptPublicKey: any }>, opts: { lockTime?: bigint; sequence?: bigint; sigs?: string[] } = {}) {
  const tx = new k.Transaction({
    version: 0,
    inputs: entries.map((e, n) => ({
      previousOutpoint: e.outpoint,
      signatureScript: opts.sigs?.[n] ?? "",
      sequence: opts.sequence ?? 0n,
      sigOpCount: 1,
      utxo: { outpoint: e.outpoint, amount: e.amountSompi, scriptPublicKey: new k.ScriptPublicKey(e.scriptPublicKey.version, e.scriptPublicKey.script), blockDaaScore: e.blockDaaScore, isCoinbase: e.isCoinbase }
    })),
    outputs,
    lockTime: opts.lockTime ?? 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  tx.storageMass = calculateUpstreamStorageMass(entries.map((e) => e.amountSompi), outputs.map((o) => o.value), "simnet");
  tx.finalize();
  return tx;
}

beforeAll(async () => {
  session = await startIsolatedSimnet({ minerFixture: "alice" });
  expect(session.containerName).not.toBe("hardkas-kaspad-toccata-v2");
  k = loadManagedKaspaWasmSync();
  ALICE = session.minerAddress;
  ALICE_KEY = session.minerPrivateKey;
  BOB = String(new k.PrivateKey(getHardkasFixtureKey("bob")).toPublicKey().toAddress("simnet").toString());
  CAROL_ECDSA = String(new k.PrivateKey(CAROL_KEY).toPublicKey().toAddressECDSA("simnet").toString());
  const info: any = await session.rpc.getServerInfo();
  evidence.node = { rpcUrl: session.rpcUrl, containerName: session.containerName, image: process.env.HARDKAS_KASPAD_IMAGE ?? KASPAD_REFERENCE_IMAGE, serverVersion: info.serverVersion, networkId: info.networkId };
  await fundTestAccount(session, ALICE, 1_000_000_000n);
  await mineBlocks(session, 30);

  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-cltv-ecdsa-"));
  const init = spawnSync(process.execPath, [cliDist, "init", "app", "--network", "simnet", "--skip-toolchain", "--json"], { cwd: parent, encoding: "utf8", env: process.env, timeout: 180_000 });
  expect(init.status, `${init.stdout}\n${init.stderr}`).toBe(0);
  ws = path.join(parent, "app");
  const config = {
    execution: { default: "node", targets: { node: { mode: "rpc", domain: "kaspa-l1", network: "simnet" } } },
    networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: session.rpcUrl } }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config, null, 2)};\n`);
  const imports: Array<[string, string, string, string[]]> = [
    ["alice", ALICE, ALICE_KEY, []],
    ["carol", CAROL_ECDSA, CAROL_KEY, ["--ecdsa"]]
  ];
  for (const [name, address, key, extra] of imports) {
    const imp = spawnSync(process.execPath, [cliDist, "accounts", "real", "import", "--name", name, "--address", address, ...extra, "--private-key-env", "HK_CLTV_ECDSA_KEY", "--password-env", PW_ENV, "--json"], {
      cwd: ws,
      encoding: "utf8",
      env: { ...process.env, HK_CLTV_ECDSA_KEY: key, [PW_ENV]: PASSWORD },
      timeout: 180_000
    });
    expect(imp.status, `${name}: ${imp.stdout}\n${imp.stderr}`).toBe(0);
  }
  sdk = await Hardkas.open({ cwd: ws, network: "simnet" });
});

afterAll(async () => {
  evidence.finishedAt = new Date().toISOString();
  const file = process.env.HARDKAS_TEST_CLTV_ECDSA_EVIDENCE || path.join(os.tmpdir(), `cltv-ecdsa-node-${Date.now()}.json`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(json(evidence), null, 2));
    console.log(`[cltv-ecdsa-node] evidence written to ${file}`);
  } catch {
    /* diagnostic */
  }
  await sdk?.close?.();
  if (session) await stopIsolatedSimnet(session);
  if (parent) fs.rmSync(parent, { recursive: true, force: true });
});

describe("CLTV · payments with an absolute lock time (sdk.tx.plan / sign / send) against rusty-kaspad", () => {
  it("L-1 a DAA-score lock: refused by HardKAS before the broadcast and by the node, before and AT the lock; the same transaction accepted once the virtual DAA score passes it", async () => {
    const v0 = (await dagPoint()).virtualDaaScore;
    const lock = v0 + 25n;
    const plan: any = await sdk.tx.plan({ from: "alice", to: BOB, amount: "1", lockTime: { daaScore: lock } });
    expect(plan.lockTime.daaScore).toBe(lock.toString());
    expect(BigInt(plan.lockTime.observedAt.virtualDaaScore)).toBeGreaterThanOrEqual(v0);
    const signed: any = await sdk.tx.sign(plan, { account: "alice", keystorePassword: PASSWORD });
    const rpcTx = rpcOf(signed);
    expect(String(rpcTx.lockTime)).toBe(lock.toString());
    const before = submissionsIn();

    const early = await settle(sdk.tx.send(signed));
    const earlyNode = await submit(rpcTx);
    const at = await mineTo(lock);
    const atSend = at === lock ? await settle(sdk.tx.send(signed)) : undefined;
    const atNode = at === lock ? await submit(rpcTx) : { accepted: false, reason: `virtual overshot to ${at}` };
    const recordedEarly = submissionsIn() - before;
    const after = await mineTo(lock + 1n);
    const sent = await settle(sdk.tx.send(signed));
    const ok = accepted(sent);
    const out = ok ? await confirm(BOB, { transactionId: signed.txId, index: rpcTx.outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 100_000_000n) }) : undefined;
    record({
      id: "L-1",
      vector: "payment, DAA-score lock time",
      hardkas: { lockTime: lock, txId: signed.txId, earlySend: early.ok ? "SENT" : (early as any).code, atLockSend: atSend ? (atSend.ok ? "SENT" : (atSend as any).code) : "skipped", recordedBeforeReached: recordedEarly },
      node: { virtualAtPlan: v0, early: earlyNode, atLock: { virtual: at, ...atNode }, afterLock: { virtual: after, accepted: ok, mined: Boolean(out), ...(ok ? {} : { reason: JSON.stringify(sent) }) } },
      agree: !early.ok && !earlyNode.accepted && !atNode.accepted && (atSend === undefined || !atSend.ok) && ok && Boolean(out) && recordedEarly === 0
    });
    expect(early.ok ? "SENT" : (early as any).code).toBe("LOCK_TIME_NOT_REACHED");
    expect(earlyNode.accepted, earlyNode.reason).toBe(false);
    if (at === lock) {
      expect(atSend!.ok ? "SENT" : (atSend as any).code).toBe("LOCK_TIME_NOT_REACHED");
      expect(atNode.accepted, atNode.reason).toBe(false);
    }
    expect(recordedEarly, "nothing recorded before the lock").toBe(0);
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(String((sent as any).value?.txId ?? "").toLowerCase()).toBe(String(signed.txId).toLowerCase());
    expect(out?.amountSompi).toBe(100_000_000n);
  });

  it("L-2 the finality rule: every input at the maximum sequence voids the lock (accepted at once); at sequence 0 the same lock is refused", async () => {
    const coin = await fundTestAccount(session, ALICE, 500_000_000n);
    const lock = (await dagPoint()).virtualDaaScore + 10_000n;
    const fee = 1_000_000n;
    const outputs = [{ value: coin.amountSompi - fee, scriptPublicKey: k.payToAddressScript(new k.Address(ALICE)) }];
    const signedWith = (sequence: bigint) => {
      const unsigned = wasmTx([coin], outputs, { lockTime: lock, sequence });
      const sig = String(k.createInputSignature(unsigned, 0, new k.PrivateKey(ALICE_KEY), k.SighashType.All));
      // the RPC JSON of a sequence-0 twin, the input's sequence then set to the exact u64 (the wire carries u64 fields as
      // bigints; parseWasmTxToRpc refuses a number above 2^53 rather than round it)
      const rpc = parseWasmTxToRpc(wasmTx([coin], outputs, { lockTime: lock, sequence: 0n, sigs: [sig] }).serializeToObject());
      rpc.inputs[0].sequence = sequence;
      return rpc;
    };
    const zero = await submit(signedWith(0n));
    const max = await submit(signedWith(MAX_TX_IN_SEQUENCE_NUM));
    record({ id: "L-2", vector: "lock time ignored when every input is at the maximum sequence", node: { sequence0: zero, sequenceMax: max }, agree: !zero.accepted && max.accepted });
    expect(zero.accepted, zero.reason).toBe(false);
    expect(max.accepted, max.reason).toBe(true);
    await mineBlocks(session, 2);
  });

  it("L-3 a time lock: far ahead refused (HardKAS and node); at the past median time refused, the same transaction accepted once it passes", async () => {
    const p0 = await dagPoint();
    const far: any = await sdk.tx.plan({ from: "alice", to: BOB, amount: "0.5", lockTime: { timestampMs: p0.pastMedianTimeMs + 3_600_000n } });
    const farSigned: any = await sdk.tx.sign(far, { account: "alice", keystorePassword: PASSWORD });
    const farSend = await settle(sdk.tx.send(farSigned));
    const farNode = await submit(rpcOf(farSigned));

    const lock = (await dagPoint()).pastMedianTimeMs;
    const plan: any = await sdk.tx.plan({ from: "alice", to: BOB, amount: "0.25", lockTime: { timestampMs: lock } });
    const signed: any = await sdk.tx.sign(plan, { account: "alice", keystorePassword: PASSWORD });
    const atNode = await submit(rpcOf(signed));
    const atSend = await settle(sdk.tx.send(signed));
    let pmt = (await dagPoint()).pastMedianTimeMs;
    for (let round = 0; round < 40 && pmt <= lock; round++) {
      await new Promise((r) => setTimeout(r, 250));
      await mineBlocks(session, 25);
      pmt = (await dagPoint()).pastMedianTimeMs;
    }
    const sent = await settle(sdk.tx.send(signed));
    const ok = accepted(sent);
    const out = ok ? await confirm(BOB, { transactionId: signed.txId, index: rpcOf(signed).outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 25_000_000n) }) : undefined;
    record({
      id: "L-3",
      vector: "payment, time lock (past median time)",
      hardkas: { farLock: far.lockTime, farSend: farSend.ok ? "SENT" : (farSend as any).code, atLock: plan.lockTime, atSend: atSend.ok ? "SENT" : (atSend as any).code },
      node: { far: farNode, atPmt: atNode, pmtAfter: pmt, passed: { accepted: ok, mined: Boolean(out), ...(ok ? {} : { reason: JSON.stringify(sent) }) } },
      agree: !farSend.ok && !farNode.accepted && !atNode.accepted && !atSend.ok && ok
    });
    expect(farSend.ok ? "SENT" : (farSend as any).code).toBe("LOCK_TIME_NOT_REACHED");
    expect(farNode.accepted, farNode.reason).toBe(false);
    expect(atNode.accepted, atNode.reason).toBe(false);
    expect(atSend.ok ? "SENT" : (atSend as any).code).toBe("LOCK_TIME_NOT_REACHED");
    expect(pmt > lock, `the past median time did not pass ${lock} (${pmt})`).toBe(true);
    expect(ok, JSON.stringify(sent)).toBe(true);
  });
});

describe("CLTV · a SilverScript contract that requires tx.daa >= unlockDaa (OpCheckLockTimeVerify)", () => {
  it("S-1 too early refused (HardKAS's preflight and the node); a lock time below the script's value and one of the other kind refused by the script; on time accepted and mined", async () => {
    const owner = new k.PrivateKey(ALICE_KEY);
    const xonly = String(owner.toPublicKey().toXOnlyPublicKey().toString());
    const unlockDaa = (await dagPoint()).virtualDaaScore + 40n;
    const source = `pragma silverscript ^0.1.0;

contract AbsoluteDaaLock(pubkey owner, int unlockDaa) {
    entry claim(sig ownerSig) {
        require(tx.daa >= unlockDaa);
        require(checkSig(ownerSig, owner));
    }
}
`;
    const { artifact } = await compileSilverScript({ source, constructorArgs: [{ kind: "bytes", value: Buffer.from(xonly, "hex") }, { kind: "int", value: unlockDaa }] });
    const bytecode = silContractBytecodeHex(getSilContract(artifact).contract);
    const lock = silverP2shLock(bytecode);
    const p2sh = silverP2shAddress(bytecode, "simnet");
    const coin = await fundTestAccount(session, ALICE, 3_000_000_000n);
    const funding = buildScriptFunding({ utxos: [coin as any], privateKey: ALICE_KEY, lockingScript: lock, valueSompi: 2_000_000_000n, networkId: "simnet" });
    const funded = await submit(funding.rpcTransaction);
    expect(funded.accepted, funded.reason).toBe(true);
    const utxo: any = await confirm(p2sh, { transactionId: funding.txId, index: 0 });

    const sweep = (lockTime: any) =>
      buildSilverSweep({ artifact, entry: "claim", args: [{ kind: "signature", privateKey: ALICE_KEY }], utxo, to: BOB, networkId: "simnet", lockTime });
    const early = sweep({ daaScore: unlockDaa });
    expect(early.lockTime).toBe(unlockDaa);
    let preflightEarly = "PASSED";
    try {
      assertPayloadLockTimeReached(early.rpcTransaction, await session.rpc.call("getBlockDagInfo", {}));
    } catch (e: any) {
      preflightEarly = String(e?.code);
    }
    const earlyNode = await submit(early.rpcTransaction);
    let voidCode = "BUILT";
    try {
      buildSilverSweep({ artifact, entry: "claim", args: [{ kind: "signature", privateKey: ALICE_KEY }], utxo, to: BOB, networkId: "simnet", lockTime: { daaScore: unlockDaa }, sequence: MAX_TX_IN_SEQUENCE_NUM });
    } catch (e: any) {
      voidCode = String(e?.code);
    }

    await mineTo(unlockDaa + 2n);
    const below = sweep({ daaScore: unlockDaa - 1n });
    const belowNode = await submit(below.rpcTransaction);
    const otherKind = sweep({ timestampMs: (await dagPoint()).pastMedianTimeMs - 1n });
    const otherKindNode = await submit(otherKind.rpcTransaction);
    const onTime = sweep({ daaScore: unlockDaa });
    expect(onTime.txId, "the early and the on-time spend are one transaction").toBe(early.txId);
    let preflightOnTime = "PASSED";
    try {
      assertPayloadLockTimeReached(onTime.rpcTransaction, await session.rpc.call("getBlockDagInfo", {}));
    } catch (e: any) {
      preflightOnTime = String(e?.code);
    }
    const onTimeNode = await submit(onTime.rpcTransaction);
    const out = onTimeNode.accepted ? await confirm(BOB, { transactionId: onTime.txId, index: 0 }) : undefined;
    record({
      id: "S-1",
      vector: "SilverScript tx.daa >= unlockDaa (CLTV)",
      hardkas: { unlockDaa, txId: onTime.txId, preflightEarly, preflightOnTime, maxSequence: voidCode, feeSompi: onTime.feeSompi },
      node: { early: earlyNode, belowScriptValue: belowNode, otherKind: otherKindNode, onTime: { ...onTimeNode, mined: Boolean(out) } },
      agree: preflightEarly === "LOCK_TIME_NOT_REACHED" && !earlyNode.accepted && !belowNode.accepted && !otherKindNode.accepted && preflightOnTime === "PASSED" && onTimeNode.accepted && Boolean(out)
    });
    expect(preflightEarly).toBe("LOCK_TIME_NOT_REACHED");
    expect(earlyNode.accepted, earlyNode.reason).toBe(false);
    expect(voidCode).toBe("LOCK_TIME_VOID_SEQUENCE");
    expect(belowNode.accepted, belowNode.reason).toBe(false);
    expect(otherKindNode.accepted, otherKindNode.reason).toBe(false);
    expect(preflightOnTime).toBe("PASSED");
    expect(onTimeNode.accepted, onTimeNode.reason).toBe(true);
    expect(out?.amountSompi).toBe(onTime.outputSompi);
  });
});

describe("ECDSA spends · an ECDSA account's payments against rusty-kaspad", () => {
  it("E-1 funded, planned, signed with ECDSA and sent: accepted with the exact value; one byte off, the high-S twin, a Schnorr signature and one sompi under the floor refused", async () => {
    // fund carol's ECDSA address (paying to ECDSA: V-04)
    const fundPlan: any = await sdk.tx.plan({ from: "alice", to: CAROL_ECDSA, amount: "5" });
    const fundSigned: any = await sdk.tx.sign(fundPlan, { account: "alice", keystorePassword: PASSWORD });
    const fundSent = await settle(sdk.tx.send(fundSigned));
    expect(accepted(fundSent), JSON.stringify(fundSent)).toBe(true);
    const fundIndex = rpcOf(fundSigned).outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 500_000_000n);
    await confirm(CAROL_ECDSA, { transactionId: fundSigned.txId, index: fundIndex });

    const plan: any = await sdk.tx.plan({ from: "carol", to: BOB, amount: "1" });
    expect(plan.inputs.every((i: any) => i.address === CAROL_ECDSA)).toBe(true);
    const signed: any = await sdk.tx.sign(plan, { account: "carol", keystorePassword: PASSWORD });
    const rpcTx = rpcOf(signed);
    expect(rpcTx.inputs.every((i: any) => /^41[0-9a-f]{128}01$/.test(i.signatureScript))).toBe(true);

    // the node's UTXO entries, for the probes
    const entries = await Promise.all(plan.inputs.map((i: any) => waitForUtxo(session, CAROL_ECDSA, { transactionId: String(i.outpoint.transactionId).toLowerCase(), index: Number(i.outpoint.index) })));
    const outputs = rpcTx.outputs.map((o: any) => ({ value: BigInt(o.amount ?? o.value), scriptPublicKey: new k.ScriptPublicKey(Number(o.scriptPublicKey.version ?? 0), String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script)) }));
    const ecdsaSigs = (outs: any[]) => {
      const unsigned = wasmTx(entries, outs);
      const view = kaspaSighashInputsFromWasm(unsigned.serializeToObject());
      return entries.map((_e, n) => "41" + signKaspaInputEcdsa({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, privateKey: CAROL_KEY }));
    };
    // HardKAS's ECDSA signature verifies locally against the node's entry
    {
      const view = kaspaSighashInputsFromWasm(wasmTx(entries, outputs).serializeToObject());
      rpcTx.inputs.forEach((i: any, n: number) =>
        expect(verifyKaspaInputSignatureEcdsa({ tx: view.tx, inputIndex: n, utxo: view.utxos[n]!, publicKey: ecdsaCompressedPublicKey(CAROL_KEY), signature: i.signatureScript.slice(2) }), `input ${n}`).toBe(true)
      );
    }
    const variant = (sigs: string[], outs = outputs) => parseWasmTxToRpc(wasmTx(entries, outs, { sigs }).serializeToObject());
    const good = ecdsaSigs(outputs);
    const offByOne = good.map((s, n) => (n === 0 ? s.slice(0, 20) + (s[20] === "0" ? "1" : "0") + s.slice(21) : s));
    const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const highS = good.map((s) => s.slice(0, 66) + (N - BigInt("0x" + s.slice(66, 130))).toString(16).padStart(64, "0") + s.slice(130));
    const schnorrSigs = entries.map((_e, n) => String(k.createInputSignature(wasmTx(entries, outputs), n, new k.PrivateKey(CAROL_KEY), k.SighashType.All)));
    const offNode = await submit(variant(offByOne));
    const highSNode = await submit(variant(highS));
    const schnorrNode = await submit(variant(schnorrSigs));

    // the fee against HardKAS's minimum, and one sompi under it (the change output one sompi larger, re-signed with ECDSA)
    const fee = BigInt(plan.estimatedFeeSompi);
    const minimum = v0Minimum(rpcTx.inputs.length, rpcTx.outputs.map((o: any) => String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script).length / 2));
    const changeIndex = rpcTx.outputs.findIndex((o: any) => String(o.scriptPublicKey.scriptPublicKey ?? o.scriptPublicKey.script) === expectedScriptPublicKeyHex(CAROL_ECDSA));
    let under: any = { skipped: "the plan has no change output or does not pay the minimum exactly" };
    if (changeIndex >= 0 && fee === minimum) {
      const outs = outputs.map((o: any, n: number) => (n === changeIndex ? { value: o.value + 1n, scriptPublicKey: o.scriptPublicKey } : o));
      under = await submit(variant(ecdsaSigs(outs), outs));
    }

    // sent with the payment preflight: the ECDSA signature verified locally against the node's entry before the broadcast
    const sent = await settle(sdk.tx.send(signed, { preflight: true }));
    const ok = accepted(sent);
    const preflight = (sent as any).value?.receipt?.preflight;
    const out = ok ? await confirm(BOB, { transactionId: signed.txId, index: rpcTx.outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 100_000_000n) }) : undefined;
    expect(preflight?.guarantee, JSON.stringify((sent as any).value?.receipt ?? sent)).toBe(PAYMENT_PREFLIGHT_GUARANTEE_ECDSA);
    record({
      id: "E-1",
      vector: "payment from an ECDSA account (HardKAS ECDSA signer)",
      hardkas: { txId: signed.txId, feeSompi: fee, minimumSompi: minimum, inputs: rpcTx.inputs.length },
      node: { oneByteOff: offNode, highS: highSNode, schnorrOnEcdsaInput: schnorrNode, underMinimumByOne: under, sent: { accepted: ok, mined: Boolean(out), value: out?.amountSompi, ...(ok ? {} : { reason: JSON.stringify(sent) }) } },
      agree: !offNode.accepted && !highSNode.accepted && !schnorrNode.accepted && (under.skipped !== undefined || !under.accepted) && ok && out?.amountSompi === 100_000_000n && fee >= minimum
    });
    expect(offNode.accepted, offNode.reason).toBe(false);
    expect(highSNode.accepted, highSNode.reason).toBe(false);
    expect(schnorrNode.accepted, schnorrNode.reason).toBe(false);
    if (under.skipped === undefined) expect(under.accepted, under.reason).toBe(false);
    expect(fee).toBeGreaterThanOrEqual(minimum);
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(String((sent as any).value?.txId ?? "").toLowerCase()).toBe(String(signed.txId).toLowerCase());
    expect(out?.amountSompi).toBe(100_000_000n);
  });

  it("E-2 mixed inputs: a Schnorr input (alice) and an ECDSA input (carol) in one transaction, each signed with its scheme, sent by sdk.tx.send and accepted", async () => {
    const aliceCoin = await fundTestAccount(session, ALICE, 300_000_000n);
    const carolCoins = (await session.rpc.getUtxosByAddress(CAROL_ECDSA)).map((u: any) => u);
    expect(carolCoins.length).toBeGreaterThan(0);
    const carolCoin: any = await waitForUtxo(session, CAROL_ECDSA, { transactionId: String(carolCoins[0].outpoint.transactionId).toLowerCase(), index: Number(carolCoins[0].outpoint.index) });
    const toUtxo = (u: any, address: string) => ({
      outpoint: u.outpoint,
      address,
      amountSompi: u.amountSompi,
      scriptPublicKey: u.scriptPublicKey.version.toString(16).padStart(4, "0") + u.scriptPublicKey.script,
      blockDaaScore: u.blockDaaScore,
      isCoinbase: u.isCoinbase
    });
    const coins = [toUtxo(aliceCoin, ALICE), toUtxo(carolCoin, CAROL_ECDSA)];
    const amount = aliceCoin.amountSompi + carolCoin.amountSompi - 50_000_000n;
    // the Generator plans one address's coins: both are handed to it as alice's, then each input gets its own address back
    const planned = await new TxPlanService({ getUtxos: async () => coins.map((c) => ({ ...c, address: ALICE })), getVirtualDaaScore: async () => (await dagPoint()).virtualDaaScore }).planTransactionUpstream({
      fromAddress: ALICE,
      toAddress: BOB,
      amountSompi: amount,
      networkId: "simnet"
    } as any);
    expect(planned.plan.inputs.length).toBe(2);
    const plan: any = createTxPlanArtifact({
      ctx: systemRuntimeContext,
      networkId: "simnet" as any,
      mode: "rpc" as any,
      from: { input: "alice", address: ALICE, accountName: "alice" },
      to: { input: BOB, address: BOB },
      amountSompi: amount,
      plan: planned.plan
    } as any);
    for (const i of plan.inputs) {
      const c = coins.find((x) => x.outpoint.transactionId === i.outpoint.transactionId && x.outpoint.index === i.outpoint.index)!;
      i.address = c.address;
      i.scriptPublicKey = c.scriptPublicKey;
    }
    finalizeTxPlanIdentity(plan);
    await sdk.artifacts.write(plan);
    const authorizers: Record<number, any> = {};
    plan.inputs.forEach((i: any, n: number) => (authorizers[n] = i.address === CAROL_ECDSA ? new EcdsaPrivateKeyAuthorizer("carol", CAROL_KEY) : new PrivateKeyAuthorizer("alice", ALICE_KEY)));
    const signed: any = await sdk.tx.sign(plan, { authorizers });
    const sent = await settle(sdk.tx.send(signed));
    const ok = accepted(sent);
    const out = ok ? await confirm(BOB, { transactionId: signed.txId, index: 0 }) : undefined;
    record({
      id: "E-2",
      vector: "mixed Schnorr + ECDSA inputs",
      hardkas: { txId: signed.txId, inputs: plan.inputs.map((i: any) => i.address), feeSompi: plan.estimatedFeeSompi },
      node: { accepted: ok, mined: Boolean(out), ...(ok ? {} : { reason: JSON.stringify(sent) }) },
      agree: ok && Boolean(out)
    });
    expect(ok, JSON.stringify(sent)).toBe(true);
    expect(out?.amountSompi).toBe(amount);
  });
});

describe("CLTV + ECDSA · the built CLI against the node (tx send shortcut mode)", () => {
  const cli = (args: string[]) => {
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, encoding: "utf8", env: { ...process.env, [PW_ENV]: PASSWORD }, timeout: 300_000 });
    let out: any;
    try {
      out = JSON.parse(r.stdout);
    } catch {
      out = undefined;
    }
    return { status: r.status, json: out, text: `${r.stdout}\n${r.stderr}`.slice(0, 3000) };
  };

  it("C-1 tx send --lock-time-daa: a lock ahead is refused at the send step (LOCK_TIME_NOT_REACHED, nothing recorded); a lock already passed is sent", async () => {
    const v = (await dagPoint()).virtualDaaScore;
    const before = submissionsIn();
    const ahead = cli(["tx", "send", "--from", "alice", "--to", BOB, "--amount", "0.3", "--network", "simnet", "--lock-time-daa", String(v + 500n), "--password-env", PW_ENV, "--json"]);
    const recorded = submissionsIn() - before;
    const passed = cli(["tx", "send", "--from", "alice", "--to", BOB, "--amount", "0.3", "--network", "simnet", "--lock-time-daa", String(v - 1n), "--password-env", PW_ENV, "--json"]);
    record({ id: "C-1", vector: "CLI tx send --lock-time-daa", hardkas: { aheadExit: ahead.status, aheadText: ahead.text.slice(0, 600), recordedAhead: recorded, passedExit: passed.status }, agree: ahead.status !== 0 && /LOCK_TIME_NOT_REACHED/.test(ahead.text) && recorded === 0 && passed.status === 0 });
    expect(ahead.status, ahead.text).not.toBe(0);
    expect(ahead.text).toMatch(/LOCK_TIME_NOT_REACHED/);
    expect(recorded).toBe(0);
    expect(passed.status, passed.text).toBe(0);
    await mineBlocks(session, 2);
  });

  it("E-1b tx send --preflight from the ECDSA account (shortcut mode): planned, signed with ECDSA, checked and sent", async () => {
    // carol's coins went into E-2: fund her again
    const fundPlan: any = await sdk.tx.plan({ from: "alice", to: CAROL_ECDSA, amount: "2" });
    const fundSigned: any = await sdk.tx.sign(fundPlan, { account: "alice", keystorePassword: PASSWORD });
    expect(accepted(await settle(sdk.tx.send(fundSigned)))).toBe(true);
    await confirm(CAROL_ECDSA, { transactionId: fundSigned.txId, index: rpcOf(fundSigned).outputs.findIndex((o: any) => BigInt(o.amount ?? o.value) === 200_000_000n) });
    const r = cli(["tx", "send", "--from", "carol", "--to", BOB, "--amount", "0.5", "--network", "simnet", "--preflight", "--password-env", PW_ENV, "--json"]);
    record({ id: "E-1b", vector: "CLI tx send --preflight from an ECDSA account", hardkas: { exit: r.status, text: r.status === 0 ? undefined : r.text.slice(0, 800) }, agree: r.status === 0 });
    expect(r.status, r.text).toBe(0);
    await mineBlocks(session, 2);
  });
});

describe("CLTV + ECDSA · summary", () => {
  it("every vector agrees with the node", () => {
    const off = (evidence.vectors as any[]).filter((v) => v.agree !== true);
    expect(off, JSON.stringify(json(off), null, 2)).toEqual([]);
  });
});
