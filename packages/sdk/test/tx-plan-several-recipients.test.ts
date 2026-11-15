import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { Hardkas } from "../src/index.js";
import { withClientUrl } from "./helpers/rpc-instance.js";
import { officialSignedPayload } from "./helpers/official-signed-payload.js";
import { startDecoy, type Decoy } from "../../cli/test/helpers/mainnet-decoy.js";
import {
  calculateContentHash,
  CURRENT_HASH_VERSION,
  expectedScriptPublicKeyHex,
  createLineageTransition,
  HardkasSchemas,
  HARDKAS_VERSION,
  ARTIFACT_VERSION
} from "@hardkas/artifacts";

// R4-T · sdk.tx.plan({ outputs }): several recipients paid by ONE transaction (one change output, one fee), on a scripted
// node (real kaspasim addresses and scripts, the real Generator):
//   - the plan records every output in order; `to`/`amountSompi` name the first recipient; one entry is the
//     one-recipient plan byte for byte;
//   - the form is checked before anything is read (TX_PLAN_RECIPIENTS_CONFLICT / TX_PLAN_RECIPIENTS_INVALID);
//   - the guards of a payment apply (fee limit, covenant UTXOs never spent, TOO_MANY_OUTPUTS with how many fit,
//     mainnet refused with nothing contacted, the simulator plans and executes it);
//   - tx.send derives the fee over every output and refuses a signed transaction that differs from the plan in ANY
//     recipient (amount, destination, order, a dropped or an extra one): SIGNED_PLAN_MISMATCH, nothing sent or written.

const LOOPBACK = "http://127.0.0.1:16110";
const NOW = Date.parse("2026-11-15T12:00:00.000Z");
const k: any = loadManagedKaspaWasmSync();
const addrOf = (i: number) => String(new k.PrivateKey((i + 0x5100).toString(16).padStart(64, "0")).toPublicKey().toAddress("simnet").toString());
const FROM = addrOf(0);
const R = [addrOf(1), addrOf(2), addrOf(3)];
const script = (address: string) => expectedScriptPublicKeyHex(address)!;
const ext = (address: string) => ({ name: address, kind: "external-wallet", network: "simnet", address }) as any;
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 10_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 5_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];
const THREE = [
  { to: ext(R[0]!), amount: "10" },
  { to: ext(R[1]!), amount: "25.5" },
  { to: ext(R[2]!), amount: 700_000_000n }
];

/** A signed artifact re-issued from `plan` whose payload is the RPC transaction the plan authorizes (or a mutation of it). */
function signedFromPlan(plan: any, mutate: (tx: any) => void = () => {}): any {
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
  mutate(tx);
  const s: any = {
    schema: HardkasSchemas.SignedTx,
    schemaVersion: HardkasSchemas.ArtifactV1,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    createdAt: new Date(NOW).toISOString(),
    status: "signed",
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    execution: plan.execution,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txId: officialSignedPayload(tx).txId,
    signedTransaction: { format: "hex", payload: JSON.stringify(tx) },
    lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {})
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

describe("R4-T · sdk.tx.plan({ outputs }) on a node network", () => {
  let ws: string;
  let sdk: Hardkas;
  let submit: MockInstance;
  let utxoReads: MockInstance;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4t-sdk-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simnet" });
    const cfg: any = sdk.config.config;
    cfg.networks = { ...(cfg.networks ?? {}), simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } };
    utxoReads = vi.spyOn(sdk.rpc, "getUtxosByAddress").mockImplementation(async () => UTXOS.map((u) => ({ ...u })) as any);
    vi.spyOn(sdk.rpc, "getMempoolEntriesByAddresses").mockResolvedValue({ entries: [] } as any);
    vi.spyOn(sdk.rpc, "getBlockDagInfo").mockResolvedValue({ networkId: "simnet", virtualDaaScore: 1_000_000n, tipHashes: ["s"], virtualParentHashes: ["s"], sink: "s" } as any);
    vi.spyOn(sdk.rpc, "getServerInfo").mockResolvedValue({ networkId: "simnet", serverVersion: "2.1.0", isSynced: true } as any);
    vi.spyOn(sdk.rpc, "getSinkBlueScore").mockResolvedValue({ blueScore: "5000" } as any);
    submit = vi.spyOn(sdk.rpc, "submitTransaction").mockResolvedValue({ transactionId: "f".repeat(64) } as any);
    withClientUrl(sdk, LOOPBACK);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await sdk?.close?.();
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const submissions = () => {
    const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /txsubmission/i.test(f)) : [];
  };

  it("3 recipients: ONE plan with every output in order, one change output, one fee; to/amountSompi name the first; it verifies", async () => {
    const plan: any = await sdk.tx.plan({ from: ext(FROM), outputs: THREE, feeRate: 1000n });
    expect(plan.plannerAuthority).toBe("KASPA_WASM_GENERATOR");
    expect(plan.outputs).toEqual([
      { address: R[0], amountSompi: "1000000000" },
      { address: R[1], amountSompi: "2550000000" },
      { address: R[2], amountSompi: "700000000" }
    ]);
    expect(plan.to.address).toBe(R[0]);
    expect(plan.amountSompi).toBe("1000000000");
    expect(plan.change.address).toBe(FROM);
    const inSum = plan.inputs.reduce((s: bigint, i: any) => s + BigInt(i.amountSompi), 0n);
    const outSum = plan.outputs.reduce((s: bigint, o: any) => s + BigInt(o.amountSompi), 0n) + BigInt(plan.change.amountSompi);
    expect(inSum - outSum).toBe(BigInt(plan.estimatedFeeSompi));
    const verified: any = await sdk.artifacts.verify(plan, { strict: true, enforceMetadata: false });
    expect(verified.ok, JSON.stringify(verified.issues ?? verified.errors)).toBe(true);
  });

  it("one entry in `outputs` is the one-recipient plan, byte for byte (same contentHash)", async () => {
    const single: any = await sdk.tx.plan({ from: ext(FROM), to: ext(R[0]!), amount: "10", feeRate: 1000n });
    const one: any = await sdk.tx.plan({ from: ext(FROM), outputs: [{ to: ext(R[0]!), amount: "10" }], feeRate: 1000n });
    expect(one.contentHash).toBe(single.contentHash);
    expect(JSON.stringify(one)).toBe(JSON.stringify(single));
  });

  it("the form is checked before anything is read: CONFLICT (outputs with to/amount), INVALID (empty, not a list, 'all', 0, a missing recipient)", async () => {
    const refusals: Array<[string, any, string]> = [
      ["outputs and to", { from: ext(FROM), to: ext(R[0]!), outputs: THREE }, "TX_PLAN_RECIPIENTS_CONFLICT"],
      ["outputs and amount", { from: ext(FROM), amount: "1", outputs: THREE }, "TX_PLAN_RECIPIENTS_CONFLICT"],
      ["empty", { from: ext(FROM), outputs: [] }, "TX_PLAN_RECIPIENTS_INVALID"],
      ["not a list", { from: ext(FROM), outputs: { to: R[0], amount: "1" } }, "TX_PLAN_RECIPIENTS_INVALID"],
      ["all", { from: ext(FROM), outputs: [{ to: ext(R[0]!), amount: "1" }, { to: ext(R[1]!), amount: "all" }] }, "TX_PLAN_RECIPIENTS_INVALID"],
      ["no recipient", { from: ext(FROM), outputs: [{ to: ext(R[0]!), amount: "1" }, { amount: "1" }] }, "TX_PLAN_RECIPIENTS_INVALID"],
      ["no amount", { from: ext(FROM), outputs: [{ to: ext(R[0]!), amount: "1" }, { to: ext(R[1]!) }] }, "TX_PLAN_RECIPIENTS_INVALID"],
      // neither form: `to` and `amount` are optional in the type since `outputs` exists
      ["neither form", { from: ext(FROM) }, "TX_PLAN_RECIPIENTS_INVALID"],
      ["to without amount", { from: ext(FROM), to: ext(R[0]!) }, "TX_PLAN_RECIPIENTS_INVALID"],
      ["amount without to", { from: ext(FROM), amount: "1" }, "TX_PLAN_RECIPIENTS_INVALID"]
    ];
    for (const [label, options, code] of refusals) expect(await codeOf(sdk.tx.plan(options)), label).toBe(code);
    expect(utxoReads, "nothing was read").not.toHaveBeenCalled();
    // a zero amount is refused once amounts are converted, still before the node is asked for UTXOs
    expect(await codeOf(sdk.tx.plan({ from: ext(FROM), outputs: [{ to: ext(R[0]!), amount: "1" }, { to: ext(R[1]!), amount: 0n }] }))).toBe("TX_PLAN_RECIPIENTS_INVALID");
    expect(utxoReads).not.toHaveBeenCalled();
  });

  it("the fee limit applies to the one transaction (FEE_EXCEEDS_MAX), as for one recipient", async () => {
    expect(await codeOf(sdk.tx.plan({ from: ext(FROM), outputs: THREE, feeRate: 1000n, maxFeeSompi: 1n }))).toBe("FEE_EXCEEDS_MAX");
  });

  it("COVENANT-UTXO-PAYMENT-FILTER-1: a covenant's UTXO the node lists is never an input of the several-recipient plan", async () => {
    utxoReads.mockImplementation(async () => [
      { ...UTXOS[0]!, amountSompi: 900_000_000_000n, covenantId: "c".repeat(64) },
      ...UTXOS.map((u) => ({ ...u }))
    ] as any);
    const plan: any = await sdk.tx.plan({ from: ext(FROM), outputs: THREE, feeRate: 1000n });
    expect(plan.inputs.some((i: any) => i.covenantId !== undefined || BigInt(i.amountSompi) === 900_000_000_000n)).toBe(false);
  });

  it("TOO_MANY_OUTPUTS: more recipients than fit in one standard transaction, with how many fit; nothing written", async () => {
    utxoReads.mockImplementation(async () => [{ ...UTXOS[0]!, amountSompi: 1_000_000_000_000_000n }] as any);
    const many = Array.from({ length: 200 }, (_, i) => ({ to: ext(addrOf(100 + i)), amount: "1000" }));
    let refused: any;
    try {
      await sdk.tx.plan({ from: ext(FROM), outputs: many, feeRate: 100n });
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe("TOO_MANY_OUTPUTS");
    expect(refused.requestedOutputs).toBe(200);
    expect(refused.outputsThatFit).toBe(193);
    expect(refused.message).toMatch(/at most 193 of them/);
    const plans = fs.existsSync(path.join(ws, ".hardkas", "artifacts")) ? fs.readdirSync(path.join(ws, ".hardkas", "artifacts"), { recursive: true }).map(String).filter((f) => /plan/i.test(f)) : [];
    expect(plans).toEqual([]);
    // the count that fits plans
    const fits: any = await sdk.tx.plan({ from: ext(FROM), outputs: many.slice(0, 193), feeRate: 100n });
    expect(fits.outputs).toHaveLength(193);
  }, 120_000);

  it("tx.send: the transaction paying every recipient as planned is sent once; its fee is derived over all outputs", async () => {
    const plan: any = await sdk.tx.plan({ from: ext(FROM), outputs: THREE, feeRate: 1000n });
    await sdk.artifacts.write(plan);
    const s = signedFromPlan(plan);
    await sdk.artifacts.write(s);
    submit.mockResolvedValue({ transactionId: s.txId } as any);
    const sent: any = await sdk.tx.send(s, LOOPBACK);
    expect(sent.submitted).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(sent.submission.fee).toMatchObject({ status: "derived", outputCount: 4, feeSompi: plan.estimatedFeeSompi, planArtifactId: plan.contentHash });
    expect(submissions()).toHaveLength(1);
  });

  it("SIGNED_PLAN_MISMATCH for ANY recipient: an amount, a destination, the order, a dropped or an extra recipient; nothing sent or written", async () => {
    const plan: any = await sdk.tx.plan({ from: ext(FROM), outputs: THREE, feeRate: 1000n });
    await sdk.artifacts.write(plan);
    const mutations: Array<[string, (tx: any) => void]> = [
      ["second recipient paid 1 sompi more", (tx) => { tx.outputs[1].amount = (BigInt(tx.outputs[1].amount) + 1n).toString(); }],
      ["third recipient paid 1 sompi less", (tx) => { tx.outputs[2].amount = (BigInt(tx.outputs[2].amount) - 1n).toString(); }],
      ["third recipient redirected", (tx) => { tx.outputs[2].scriptPublicKey.scriptPublicKey = script(FROM); }],
      ["recipients 1 and 2 swapped", (tx) => { [tx.outputs[0], tx.outputs[1]] = [tx.outputs[1], tx.outputs[0]]; }],
      ["third recipient dropped", (tx) => { tx.outputs.splice(2, 1); }],
      ["a fourth recipient added", (tx) => { tx.outputs.splice(3, 0, { amount: "1000", scriptPublicKey: { version: 0, scriptPublicKey: script(addrOf(99)) } }); }]
    ];
    for (const [label, mutate] of mutations) {
      const s = signedFromPlan(plan, mutate);
      await sdk.artifacts.write(s);
      expect(await codeOf(sdk.tx.send(s, LOOPBACK)), label).toBe("SIGNED_PLAN_MISMATCH");
    }
    expect(submit).not.toHaveBeenCalled();
    expect(submissions()).toEqual([]);
  });
});

describe("R4-T · sdk.tx.plan({ outputs }) on the simulator and on mainnet", () => {
  const made: string[] = [];
  let decoy: Decoy;

  beforeEach(async () => {
    decoy = await startDecoy("mainnet");
  });
  afterEach(async () => {
    await decoy?.close();
    for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  it("the simulator plans, authorizes and executes it: one receipt, one output per recipient plus the change", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4t-sim-"));
    made.push(ws);
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    try {
      const plan: any = await sdk.tx.plan({ from: "alice", outputs: [{ to: "bob", amount: "1" }, { to: "carol", amount: "2" }, { to: "bob", amount: "0.5" }] });
      expect(plan.plannerAuthority).toBe("SYNTHETIC_SIMULATOR");
      expect(plan.outputs.map((o: any) => o.amountSompi)).toEqual(["100000000", "200000000", "50000000"]);
      const signed: any = await sdk.tx.sign(plan, "alice");
      const { receipt }: any = await sdk.tx.simulate(signed);
      expect(receipt.status).toBe("accepted");
      expect(receipt.createdUtxoIds).toHaveLength(plan.change ? 4 : 3);
      expect(BigInt(receipt.feeSompi)).toBe(BigInt(plan.estimatedFeeSompi));
    } finally {
      await sdk.close?.();
    }
  });

  it("mainnet: MAINNET_CONNECTION_DISABLED before anything is resolved or read; the decoy node sees no connection", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-r4t-main-"));
    made.push(ws);
    fs.mkdirSync(path.join(ws, ".hardkas"));
    const config = {
      execution: { default: "main", targets: { main: { mode: "rpc", domain: "kaspa-l1", network: "mainnet" } } },
      // the public-network gate opened, as an adversarial workspace would: mainnet must still be refused by the lockdown
      network: { allowPublic: true },
      experimental: true,
      networks: { mainnet: { kind: "kaspa-rpc", network: "mainnet", rpcUrl: decoy.url, allowMainnet: true } }
    };
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(config)};\n`);
    const sdk = await Hardkas.open({ cwd: ws, network: "mainnet" });
    try {
      const m = (i: number) => String(new k.PrivateKey((i + 0x5200).toString(16).padStart(64, "0")).toPublicKey().toAddress("mainnet").toString());
      expect(await codeOf(sdk.tx.plan({ from: m(0), outputs: [{ to: m(1), amount: "1" }, { to: m(2), amount: "2" }] }))).toBe("MAINNET_CONNECTION_DISABLED");
      expect(decoy.connections).toBe(0);
      expect(decoy.methods).toEqual([]);
    } finally {
      await sdk.close?.();
    }
  });
});
