import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildR0Groth16Scripts, buildR0Groth16Transaction, parseR0Groth16Receipt, verifyR0Groth16Scripts } from "../src/index.js";
import { spkIntrospectionBytesHex } from "../src/zk/toccata.js";

// -----------------------------------------------------------------------------
// Audit 2026-11-13, area C:
//  C-5 · verifyR0Groth16Scripts said ok / consensusEnforced for a canonical output-bound lock that can never be spent
//        (input limit at or below the bound outputs, or an output of zero or less): now ZK_BOUND_LOCK_UNSPENDABLE.
//  C-7 · buildR0Groth16Transaction reported consensusEnforced from the scripts object's label: a proof-only redeem script
//        labelled "proof-and-output-bound" gave consensusEnforced: true. Now read from the redeem script.
//  C-8 · a receipt whose claim is not pruned to a digest (no claim cross-check, no verifier-parameters check) got a
//        fundable public-network address, even for a mistyped image id: now refused there (simnet only).
// -----------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const ZK = path.resolve(here, "..", "..", "..", "fixtures", "toccata-v2", "zk");
const load = (dir: string) => ({
  receiptHex: fs.readFileSync(path.join(ZK, dir, "receipt.hex"), "utf8").trim(),
  imageId: JSON.parse(fs.readFileSync(path.join(ZK, dir, "image-id.json"), "utf8")).imageId as string,
  journalHash: JSON.parse(fs.readFileSync(path.join(ZK, dir, "journal.json"), "utf8")).journalHash as string
});
const official = load("r0-groth16-official");
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);
const k: any = loadManagedKaspaWasmSync();
const simnet = (seed: string) => new k.PrivateKey(seed.repeat(32)).toAddress("simnet").toString();
const testnet = (seed: string) => new k.PrivateKey(seed.repeat(32)).toAddress("testnet-10").toString();

/**
 * An output-bound redeem script in exactly the layout HardKAS's builder writes (toccata.ts r0BoundRedeemScript), with ANY
 * amounts and input limit: what a counterparty could hand over. Its signature script embeds it as a P2SH spend does.
 */
function handBuiltBoundLock(outputs: Array<{ address: string; amountSompi: bigint }>, maxInputSompi: bigint) {
  const fragment = k.ZkScriptBuilder.newR0();
  fragment.appendR0Groth16Verifier(official.imageId);
  const sb = new k.ScriptBuilder();
  sb.addOps(Buffer.from(String(fragment.drain()), "hex"));
  sb.addOp(k.Opcodes.OpVerify);
  sb.addOp(k.Opcodes.OpTxOutputCount);
  sb.addI64(BigInt(outputs.length));
  sb.addOp(k.Opcodes.OpNumEqualVerify);
  outputs.forEach((o, i) => {
    sb.addI64(BigInt(i));
    sb.addOp(k.Opcodes.OpTxOutputSpk);
    sb.addData(Buffer.from(spkIntrospectionBytesHex(k.payToAddressScript(new k.Address(o.address))), "hex"));
    sb.addOp(k.Opcodes.OpEqualVerify);
    sb.addI64(BigInt(i));
    sb.addOp(k.Opcodes.OpTxOutputAmount);
    sb.addI64(o.amountSompi);
    sb.addOp(k.Opcodes.OpNumEqualVerify);
  });
  sb.addOp(k.Opcodes.OpTxInputCount);
  sb.addI64(1n);
  sb.addOp(k.Opcodes.OpNumEqualVerify);
  sb.addOp(k.Opcodes.OpTxInputIndex);
  sb.addOp(k.Opcodes.OpTxInputAmount);
  sb.addI64(maxInputSompi);
  sb.addOp(k.Opcodes.OpLessThanOrEqual);
  sb.addOp(k.Opcodes.OpVerify);
  sb.addOp(k.Opcodes.OpTrue);
  const redeemScript = String(sb.drain()).toLowerCase();
  const proof = buildR0Groth16Scripts({ ...official }).preparedProof;
  const sig = new k.ScriptBuilder();
  sig.addData(Buffer.from(official.journalHash, "hex"));
  sig.addData(Buffer.from(proof, "hex"));
  sig.addData(Buffer.from(redeemScript, "hex"));
  return { redeemScript, sigScript: String(sig.drain()).toLowerCase() };
}

describe("C-5 · a canonical output-bound lock that can never be spent is not ok", () => {
  const payee = simnet("44");
  const PAYOUT = 100_000_000n;
  const verify = (lock: { redeemScript: string; sigScript: string }) =>
    verifyR0Groth16Scripts({ ...lock, expectedBindingMode: "proof-and-output-bound", expectedPayoutAddress: payee, expectedPayoutAmount: PAYOUT });

  it("C5-1 control: the same layout with a limit above the outputs is canonical, ok and consensus-enforced", () => {
    const r = verify(handBuiltBoundLock([{ address: payee, amountSompi: PAYOUT }], PAYOUT + 1n));
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    expect(r.redeemScriptCanonical).toBe(true);
    expect(r.consensusEnforced).toBe(true);
  });

  it("C5-2 an input limit equal to or below the bound outputs: ZK_BOUND_LOCK_UNSPENDABLE, not consensus-enforced (it was ok and enforced)", () => {
    for (const limit of [PAYOUT, PAYOUT - 1n, 0n]) {
      const r = verify(handBuiltBoundLock([{ address: payee, amountSompi: PAYOUT }], limit));
      expect(r.redeemScriptCanonical, `limit ${limit}`).toBe(true);
      expect(r.ok, `limit ${limit}`).toBe(false);
      expect(r.consensusEnforced, `limit ${limit}`).toBe(false);
      expect(codes(r), `limit ${limit}`).toContain("ZK_BOUND_LOCK_UNSPENDABLE");
    }
    // payout and change: the limit is compared with their sum
    const change = simnet("55");
    const two = verifyR0Groth16Scripts({ ...handBuiltBoundLock([{ address: payee, amountSompi: PAYOUT }, { address: change, amountSompi: 5n }], PAYOUT + 5n) });
    expect(codes(two)).toContain("ZK_BOUND_LOCK_UNSPENDABLE");
  });

  it("C5-3 a bound amount of zero or below: ZK_BOUND_LOCK_UNSPENDABLE", () => {
    for (const amount of [0n, -1n]) {
      const r = verifyR0Groth16Scripts({ ...handBuiltBoundLock([{ address: payee, amountSompi: amount }], PAYOUT) });
      expect(r.redeemScriptCanonical, `amount ${amount}`).toBe(true);
      expect(r.consensusEnforced, `amount ${amount}`).toBe(false);
      expect(codes(r), `amount ${amount}`).toContain("ZK_BOUND_LOCK_UNSPENDABLE");
    }
  });

  it("C5-4 HardKAS's own builder never makes one: its locks still verify", () => {
    const scripts = buildR0Groth16Scripts({ ...official, bindingPolicy: { mode: "proof-and-output-bound", payout: { address: payee, amountSompi: PAYOUT } } });
    expect(scripts.ok, JSON.stringify(scripts.issues)).toBe(true);
    expect(scripts.consensusEnforced).toBe(true);
  });
});

describe("C-7 · consensusEnforced of a spend is read from the redeem script, not from the scripts object's label", () => {
  const payee = simnet("44");
  const PAYOUT = 100_000_000n;
  const policy = { mode: "proof-and-output-bound" as const, payout: { address: payee, amountSompi: PAYOUT } };
  const spend = (scripts: any) =>
    buildR0Groth16Transaction({ scripts, utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: PAYOUT + 20_000_000n }, destinationAddress: payee, networkId: "simnet" });

  it("C7-1 control: a real output-bound lock gives a consensus-enforced spend", () => {
    const tx = spend(buildR0Groth16Scripts({ ...official, bindingPolicy: policy }));
    expect(tx.ok, JSON.stringify(tx.issues)).toBe(true);
    expect(tx.consensusEnforced).toBe(true);
    expect(tx.warnings.map((w) => w.code)).not.toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
  });

  it("C7-2 a proof-only redeem script labelled proof-and-output-bound: consensusEnforced false and ZK_BINDING_LABEL_NOT_ENFORCED (it was true)", () => {
    const proofOnly = buildR0Groth16Scripts({ ...official });
    const relabelled = { ...proofOnly, bindingMode: "proof-and-output-bound" as const, bindingPolicy: policy, consensusEnforced: true };
    const tx = spend(relabelled);
    expect(tx.bindingMode).toBe("proof-and-output-bound");
    expect(tx.consensusEnforced).toBe(false);
    expect(tx.warnings.map((w) => w.code)).toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
  });

  it("C7-3 a real output-bound lock whose label names other outputs or another fee cap than its script: not consensus-enforced", () => {
    const real = buildR0Groth16Scripts({ ...official, bindingPolicy: policy });
    const otherCap = spend({ ...real, bindingPolicy: { ...policy, maxFeeSompi: 40_000_000n } });
    expect(otherCap.consensusEnforced).toBe(false);
    expect(otherCap.warnings.map((w) => w.code)).toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
    const otherAmount = buildR0Groth16Transaction({
      scripts: { ...real, bindingPolicy: { ...policy, payout: { address: payee, amountSompi: PAYOUT - 1n } } },
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: PAYOUT + 20_000_000n },
      destinationAddress: payee,
      networkId: "simnet"
    });
    expect(otherAmount.consensusEnforced).toBe(false);
  });
});

/** The official receipt with its claim carried as a value (MaybePruned::Value) whose parts are pruned: the same claim. */
function unprunedReceipt(): string {
  const b = Buffer.from(official.receiptHex, "hex");
  const head = b.subarray(0, 4 + 256);
  const verifierParameters = b.subarray(4 + 256 + 1 + 32);
  expect(verifierParameters.length).toBe(32);
  const sha = (...p: Buffer[]) => createHash("sha256").update(Buffer.concat(p)).digest();
  const tagged = (tag: string, down: Buffer[], data: number[]) => {
    const u32 = data.map((d) => { const x = Buffer.alloc(4); x.writeUInt32LE(d); return x; });
    const n = Buffer.alloc(2);
    n.writeUInt16LE(down.length);
    return sha(sha(Buffer.from(tag)), ...down, ...u32, n);
  };
  const zero = Buffer.alloc(32);
  const post = tagged("risc0.SystemState", [zero], [0]);
  const output = tagged("risc0.Output", [Buffer.from(official.journalHash, "hex"), zero], []);
  const pruned = (d: Buffer) => Buffer.concat([Buffer.from([1]), d]);
  // ReceiptClaim { pre, post, exit_code: Halted(0), input, output } as Borsh, every part pruned to its digest
  const claim = Buffer.concat([pruned(Buffer.from(official.imageId, "hex")), pruned(post), Buffer.from([0, 0, 0, 0, 0]), pruned(zero), pruned(output)]);
  return Buffer.concat([head, Buffer.from([0]), claim, verifierParameters]).toString("hex");
}

describe("C-8 · a receipt whose claim was not cross-checked gets no public-network address", () => {
  const receiptHex = unprunedReceipt();

  it("C8-1 the receipt carries its claim unpruned: the cross-check cannot run (simnet still builds, with the warning)", () => {
    expect(parseR0Groth16Receipt(receiptHex)).toMatchObject({ ok: true, claimEncoding: "UNPRUNED_VALUE" });
    const sim = buildR0Groth16Scripts({ ...official, receiptHex });
    expect(sim.ok, JSON.stringify(sim.issues)).toBe(true);
    expect(sim.receiptClaimCrossCheck).toBe("NOT_CHECKED");
    expect(sim.warnings.map((w) => w.code)).toContain("ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED");
  });

  it("C8-2 testnet-10 is refused for it, output-bound or proof-only, even with a mistyped (non-public) image id that used to get a fundable address", () => {
    const bound = { mode: "proof-and-output-bound" as const, payout: { address: testnet("44"), amountSompi: 100_000_000n } };
    for (const [label, params] of [
      ["output-bound", { ...official, receiptHex, bindingPolicy: bound, addressNetworks: ["testnet-10" as const] }],
      ["a mistyped image id, output-bound", { ...official, imageId: "cd".repeat(32), receiptHex, bindingPolicy: bound, addressNetworks: ["testnet-10" as const] }],
      ["a mistyped image id, proof-only acknowledged", { ...official, imageId: "cd".repeat(32), receiptHex, addressNetworks: ["testnet-10" as const], acknowledgeImageIdOnlyLock: true }]
    ] as const) {
      const r = buildR0Groth16Scripts(params as any);
      expect(r.ok, label).toBe(false);
      expect(codes(r), label).toContain("ZK_RECEIPT_CLAIM_UNCHECKED_PUBLIC_NETWORK_REFUSED");
      expect(r.p2shAddresses.testnet10, label).toBeUndefined();
    }
  });

  it("C8-3 control: the pruned receipt is cross-checked and keeps its testnet-10 output-bound lock", () => {
    const r = buildR0Groth16Scripts({ ...official, bindingPolicy: { mode: "proof-and-output-bound", payout: { address: testnet("44"), amountSompi: 100_000_000n } }, addressNetworks: ["testnet-10"] });
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    expect(r.receiptClaimCrossCheck).toBe("MATCH");
  });
});
