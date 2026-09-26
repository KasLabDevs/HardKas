import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "../../src/index.js";
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
      lockTime: 0
    };
    payload(tx);
    body = JSON.stringify(tx);
  }
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: "2026-09-26T00:00:00.000Z",
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    execution: plan.execution,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId: "f".repeat(64),
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
  let submit: ReturnType<typeof vi.spyOn>;
  let plan: any;

  beforeEach(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2d-sdk-"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const cfg: any = sdk.config.config;
    cfg.defaultNetwork = "simnet";
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: "f".repeat(64) } as any);
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

  it("an opaque payload yields `insufficient-evidence` with the reason; no submission ever writes a default fee of 0", async () => {
    const opaque = signedFromPlan(plan, "deadbeef");
    await sdk.artifacts.write(opaque);
    const sent: any = await sdk.tx.send(opaque, LOOPBACK);
    expect(sent.submitted).toBe(true);
    expect(sent.submission.fee).toEqual({ status: "insufficient-evidence", reason: expect.stringMatching(/not a JSON transaction/) });
    expect(JSON.stringify(sent.submission)).not.toMatch(/"feeSompi":"0"/);
    expect(JSON.stringify(sent.submission)).not.toMatch(/estimatedFeeSompi/);
  });
});
