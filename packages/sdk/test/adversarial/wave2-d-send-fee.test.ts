import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
import { withClientUrl } from "../helpers/rpc-instance.js";
import { officialSignedPayload } from "../helpers/official-signed-payload.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  verifyArtifactIntegritySync,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

// Wave 2(d) · AUD-18 · T-A18 at the SDK send boundary
//   A real `send` records the fee DERIVED from the signed transaction's outputs and the
//   plan's authenticated inputs (matched by outpoint), authenticated in the submission;
//   when the payload is opaque the submission says `insufficient-evidence` and why. No
//   submission ever carries an estimated fee copied from metadata or a default "0".
//   2(d) security review: a signed transaction that diverges from the plan it descends
//   from (inputs, outputs in order, amounts, destinations) is SIGNED_PLAN_MISMATCH —
//   `send` refuses it before anything reaches the node; nothing is written.
//
// The plan is a real-network plan built by the upstream Generator over a scripted node
// (real kaspasim addresses, real scripts); the signed artifact is re-issued from it with
// an RPC-transaction payload, exactly what a real signer serialises.

const LOOPBACK = "http://127.0.0.1:16110";
// STALE-CLOCK-1: strict verification refuses an artifact older than 30 days (STALE_ARTIFACT). The signed artifacts below
// are dated 2026-09-26, so the suite runs on a controlled clock that same day (only Date is controlled; timers are real).
// It used to run on the wall clock and turned red when the date passed (26-oct-2026); the rule itself is unchanged and
// checked in its own case below.
const SIGNED_AT = "2026-09-26T00:00:00.000Z";
const NOW = Date.parse("2026-09-26T12:00:00.000Z");
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];

/** A signed artifact re-issued from `plan` whose payload is the RPC transaction the plan authorizes (or a mutation of it). */
function signedFromPlan(plan: any, payload: string | ((tx: any) => void)): any {
  let body: string;
  // EXPECTED-TXID-1: the artifact declares its payload's official kaspa-wasm id (a send is refused unless they agree)
  let txId = "f".repeat(64);
  if (typeof payload === "string") {
    body = payload;
  } else {
    const tx: any = {
      version: 0,
      inputs: plan.inputs.map((i: any) => ({ previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index }, signatureScript: "41aa", sequence: 0, sigOpCount: 1 })),
      outputs: [
        ...plan.outputs.map((o: any) => ({ amount: o.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(o.address) } })),
        ...(plan.change ? [{ amount: plan.change.amountSompi, scriptPublicKey: { version: 0, scriptPublicKey: script(plan.change.address) } }] : [])
      ],
      lockTime: 0,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0,
      payload: "",
      storageMass: 0
    };
    payload(tx);
    body = JSON.stringify(tx);
    txId = officialSignedPayload(tx).txId;
  }
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: SIGNED_AT,
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    execution: plan.execution,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId,
    signedTransaction: { format: "hex", payload: body },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };
  s.contentHash = calculateContentHash(s, CURRENT_HASH_VERSION);
  s.lineage.artifactId = s.contentHash;
  s.signedId = `signed-${s.contentHash.slice(0, 16)}`;
  return s;
}

const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return "OK";
  } catch (e: any) {
    return e?.code ?? `ERR:${e?.message}`;
  }
};

describe("Wave 2(d) · the submission records a derived fee or insufficient evidence; a divergent signed is refused", () => {
  let ws: string;
  let sdk: Hardkas;
  let submit: MockInstance;
  let plan: any;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2d-sdk-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    // WORKSPACE-AUTHORITY-2: the SDK is opened on the real-node simnet it is meant to plan on. It used to be opened on
    // the simulator and re-pointed by writing `config.defaultNetwork` afterwards — the legacy slot that is no longer an
    // authority (the world is resolved once, at open).
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" } as any);
    // MAINNET-PERIMETER-1: a send asks the node who it is (both answers) right before the broadcast
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: "f".repeat(64) } as any);
    // ENDPOINT-AUTHORITY-1 (EA-I2): the scripted client says it is the endpoint the sends below name
    withClientUrl(sdk, LOOPBACK);
    plan = await sdk.tx.plan({
      from: { name: FROM, kind: "external-wallet", network: "simnet", address: FROM } as any,
      to: { name: TO, kind: "external-wallet", network: "simnet", address: TO } as any,
      amount: "3",
      feeRate: 1000n
    });
    expect(plan.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(plan.change).toBeDefined();
    await sdk.artifacts.write(plan);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const submissions = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)) : [];
  };

  it("the plan's destination scripts derived without WASM equal what kaspa-wasm builds for the same addresses", async () => {
    const { loadKaspaWasm } = await import("@hardkas/accounts");
    const k: any = await loadKaspaWasm();
    for (const address of [plan.from.address, plan.to.address, plan.change.address]) {
      const wasm = k.payToAddressScript(new k.Address(address));
      expect(script(address)).toBe(String(wasm.script).toLowerCase());
    }
  });

  it("1 · plan and signed economically identical ⇒ fee derived (Σ plan inputs − Σ signed outputs), authenticated in the submission", async () => {
    const s = signedFromPlan(plan, () => {});
    await sdk.artifacts.write(s);
    submit.mockResolvedValue({ transactionId: s.txId } as any); // EXPECTED-TXID-1: the node names the transaction sent
    const sent: any = await sdk.tx.send(s, LOOPBACK);
    expect(sent.submitted).toBe(true);
    const fee = sent.submission.fee;
    expect(fee).toMatchObject({ status: "derived", method: "inputs-minus-outputs", planArtifactId: plan.contentHash, inputCount: plan.inputs.length });
    const consumed = plan.inputs.reduce((a: bigint, i: any) => a + BigInt(i.amountSompi), 0n);
    const produced = plan.outputs.reduce((a: bigint, o: any) => a + BigInt(o.amountSompi), 0n) + BigInt(plan.change.amountSompi);
    expect(fee.inputsSompi).toBe(consumed.toString());
    expect(fee.outputsSompi).toBe(produced.toString());
    expect(fee.feeSompi).toBe((consumed - produced).toString());
    expect(fee.feeSompi).toBe(plan.estimatedFeeSompi); // the Generator's fee is what the transaction actually pays
    const stored: any = await sdk.artifacts.read({ artifact: sent.submission.contentHash });
    expect(stored.fee).toEqual(fee);
    const tampered: any = structuredClone(stored);
    tampered.fee = { ...tampered.fee, feeSompi: "0" };
    expect(calculateContentHash(tampered, CURRENT_HASH_VERSION)).not.toBe(stored.contentHash);
    expect(verifyArtifactIntegritySync(structuredClone(stored), { strict: true }).authScope).toBe("FULL");
  });

  it("2 · the signed change is 7 sompi smaller ⇒ SIGNED_PLAN_MISMATCH: nothing is broadcast, nothing is written, no 'fee + 7'", async () => {
    const s = signedFromPlan(plan, (tx) => {
      const last = tx.outputs[tx.outputs.length - 1];
      last.amount = (BigInt(last.amount) - 7n).toString();
    });
    await sdk.artifacts.write(s);
    const before = submissions();
    expect(await codeOf(sdk.tx.send(s, LOOPBACK))).toBe("SIGNED_PLAN_MISMATCH");
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual(before);
  });

  it("3 · the signed payment amount differs with the same inputs ⇒ SIGNED_PLAN_MISMATCH", async () => {
    const s = signedFromPlan(plan, (tx) => {
      tx.outputs[0].amount = (BigInt(tx.outputs[0].amount) + 1n).toString();
    });
    await sdk.artifacts.write(s);
    expect(await codeOf(sdk.tx.send(s, LOOPBACK))).toBe("SIGNED_PLAN_MISMATCH");
    expect(submit).not.toHaveBeenCalled();
  });

  it("4 · extra, omitted or reordered outputs, a redirected destination or a foreign input ⇒ SIGNED_PLAN_MISMATCH", async () => {
    const mutations: Array<[string, (tx: any) => void]> = [
      ["extra output", (tx) => { tx.outputs.push({ amount: "1", scriptPublicKey: { version: 0, scriptPublicKey: script(TO) } }); }],
      ["omitted change", (tx) => { tx.outputs.pop(); }],
      ["reordered", (tx) => { tx.outputs.reverse(); }],
      ["redirected payment", (tx) => { tx.outputs[0].scriptPublicKey.scriptPublicKey = script(FROM); }],
      ["foreign input", (tx) => { tx.inputs[0].previousOutpoint.transactionId = "9".repeat(64); }]
    ];
    for (const [label, mutate] of mutations) {
      const s = signedFromPlan(plan, mutate);
      await sdk.artifacts.write(s);
      expect(await codeOf(sdk.tx.send(s, LOOPBACK)), label).toBe("SIGNED_PLAN_MISMATCH");
    }
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });

  it("STALE-CLOCK-1 · the staleness rule still holds: the same signed artifact, 31 days after it was signed, is refused (STALE_ARTIFACT); nothing broadcast or written", async () => {
    const s = signedFromPlan(plan, () => {});
    await sdk.artifacts.write(s);
    vi.setSystemTime(Date.parse(SIGNED_AT) + 31 * 24 * 60 * 60 * 1000);
    let message = "";
    try {
      await sdk.tx.send(s, LOOPBACK);
    } catch (e: any) {
      message = String(e?.message ?? e);
    }
    expect(message).toMatch(/STALE_ARTIFACT/);
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });

  // EXPECTED-TXID-1: an opaque payload is no longer sendable — its official id cannot be computed, so the TXID it is
  // sent under cannot be checked (and no HardKAS client could convert it to send it). The fee's insufficient-evidence
  // derivation itself stays covered by the artifacts suite (wave2-d-submission-fee).
  it("an opaque payload is refused before the broadcast (SIGNED_TXID_UNVERIFIABLE); nothing is written", async () => {
    const opaque = signedFromPlan(plan, "deadbeef");
    await sdk.artifacts.write(opaque);
    expect(await codeOf(sdk.tx.send(opaque, LOOPBACK))).toBe("SIGNED_TXID_UNVERIFIABLE");
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });
});
