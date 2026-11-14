import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import { buildR0Groth16Scripts, buildR0Groth16Transaction, verifyR0Groth16Scripts } from "../src/index.js";
import { BLOCK_STORAGE_MASS_LIMIT, boundMaxInputSompi, spkIntrospectionBytesHex } from "../src/zk/toccata.js";

// -----------------------------------------------------------------------------
// G1 (notes cross-check, 2026-11-14) · an output-bound lock with a small bound output.
//  - buildR0Groth16Scripts measured the spend with an input of outputs + 1 sompi (no storage mass) and said "fund it"; the
//    real spend (input = outputs + ~0.19 KAS of fee) of a 0.01 KAS output has ~950,000 g of storage mass, above the
//    500,000 g every node and block applies: funds locked for ever. Now the real spend is measured and such a lock is
//    refused (ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT), naming the smallest amount that fits.
//  - buildR0Groth16Transaction priced its floor on kaspa-wasm's max(compute, storage) and refused above 100,000 g, so it
//    refused spends of 0.02-0.17 KAS outputs the node relays. Now: the node's floor (v1FeeMass / v1MinimumRelayFee) and
//    its storage limit 500,000 g (ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT), both proven on rusty-kaspad 2.1.0 simnet with
//    plain v1 transactions (zk-storage-mass-node-rule.simnet.test.ts).
//  - verifyR0Groth16Scripts refuses a canonical lock whose cheapest spend is above the limit.
// Amounts 0.01, 0.02, 0.05, 0.17 and 1 KAS, as payout and as change, in both lock modes. Hermetic: no node.
// -----------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
const ZK = path.resolve(here, "..", "..", "..", "fixtures", "toccata-v2", "zk");
const official = {
  receiptHex: fs.readFileSync(path.join(ZK, "r0-groth16-official", "receipt.hex"), "utf8").trim(),
  imageId: JSON.parse(fs.readFileSync(path.join(ZK, "r0-groth16-official", "image-id.json"), "utf8")).imageId as string,
  journalHash: JSON.parse(fs.readFileSync(path.join(ZK, "r0-groth16-official", "journal.json"), "utf8")).journalHash as string
};
const k: any = loadManagedKaspaWasmSync();
const simnet = (seed: string) => new k.PrivateKey(seed.repeat(32)).toAddress("simnet").toString();
const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);
const KAS = 100_000_000n;
const C = 1_000_000_000_000n;
const PAYEE = simnet("44");
const CHANGE = simnet("55");
// 0.01, 0.02, 0.05, 0.17, 1 KAS
const AMOUNTS = [KAS / 100n, KAS / 50n, KAS / 20n, (17n * KAS) / 100n, KAS] as const;
const label = (v: bigint) => `${Number(v) / 1e8} KAS`;

const bound = (payout: bigint, change?: bigint) =>
  buildR0Groth16Scripts({
    ...official,
    bindingPolicy: {
      mode: "proof-and-output-bound",
      payout: { address: PAYEE, amountSompi: payout },
      ...(change !== undefined ? { change: { address: CHANGE, amountSompi: change } } : {})
    }
  });
const spend = (scripts: any, amountSompi: bigint, extra: Record<string, unknown> = {}) =>
  buildR0Groth16Transaction({ scripts, utxo: { transactionId: "11".repeat(32), index: 0, amountSompi }, destinationAddress: PAYEE, networkId: "simnet", ...extra });

/** Expected verdicts, computed by hand from KIP-9 (C/out - C/in) with a fee of ~0.19-0.2 KAS; see the margins in each row. */
const EXPECTED: Array<{ name: string; payout: bigint; change?: bigint; fits: boolean }> = [
  // payout only: 0.01 → ~951,000 g; 0.02 → ~453,000 g; larger ones far below
  ...AMOUNTS.map((a) => ({ name: `payout ${label(a)}`, payout: a, fits: a >= KAS / 50n })),
  // change next to a 1 KAS payout: 0.02 → 10,000 + 500,000 - ~8,200 ≈ 501,800 g (above); 0.05 → ~210,000 g
  ...AMOUNTS.map((a) => ({ name: `payout 1 KAS + change ${label(a)}`, payout: KAS, change: a, fits: a >= KAS / 20n })),
  // payout next to a 1 KAS change: the same arithmetic
  ...AMOUNTS.map((a) => ({ name: `payout ${label(a)} + change 1 KAS`, payout: a, change: KAS, fits: a >= KAS / 20n }))
];

describe("G1 · the node's floor and storage limit for a ZK spend", () => {
  it("the floor is the node's: for the official vector to a P2PK payout, compute mass 161,527 g and 16,152,700 sompi, as rusty-kaspad reported", () => {
    // fixtures/toccata-v2/zk/r0-groth16-official/evidence.json: "under the required amount of 16152700 for compute mass 161527"
    const scripts = buildR0Groth16Scripts({ ...official });
    const t = buildR0Groth16Transaction({
      scripts,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 2n * KAS },
      destinationAddress: "kaspasim:qprx6l72u437tjcf5rgcwza4sq6ysprp0pu6zj2feu3zshcm4cljwd5me0nwt",
      feeSompi: 20_000_000n,
      networkId: "simnet"
    });
    expect(t.ok, JSON.stringify(t.issues)).toBe(true);
    expect(t.nodeComputeMass).toBe(161_527n);
    expect(t.minimumRelayFeeSompi).toBe(16_152_700n);
    // kaspa-wasm's figure (the recommendation's basis) stays at or above the node's
    expect(t.computeMass >= t.nodeComputeMass!).toBe(true);
  });

  it("the storage limit applied is the block's 500,000 g (proven on simnet), not the wallet's 100,000", () => {
    expect(BLOCK_STORAGE_MASS_LIMIT).toBe(500_000n);
  });
});

describe("G1 · buildR0Groth16Scripts (output-bound) measures the funded spend and refuses one that can never be included", () => {
  for (const row of EXPECTED) {
    it(`${row.name}: ${row.fits ? "built; its funded spend fits and the spend builder accepts it" : "refused, with the smallest amounts that fit"}`, () => {
      const s = bound(row.payout, row.change);
      if (row.fits) {
        expect(s.ok, JSON.stringify(s.issues)).toBe(true);
        expect(s.consensusEnforced).toBe(true);
        expect(s.spendStorageMass! <= BLOCK_STORAGE_MASS_LIMIT).toBe(true);
        // the spend HardKAS builds for exactly that funding: accepted by its own builder, same storage mass
        const t = spend(s, s.requiredFundingSompi!);
        expect(t.ok, JSON.stringify(t.issues)).toBe(true);
        expect(t.consensusEnforced).toBe(true);
        expect(t.storageMass).toBe(s.spendStorageMass);
        expect(t.feeSompi >= t.minimumRelayFeeSompi!).toBe(true);
        expect(codes(t)).toEqual([]);
        expect(t.warnings.map((w) => w.code)).not.toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
        // and the lock verifies
        expect(verifyR0Groth16Scripts({ redeemScript: s.redeemScript, sigScript: s.sigScript }).ok).toBe(true);
      } else {
        expect(s.ok).toBe(false);
        expect(codes(s)).toEqual(["ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT"]);
        // nothing to fund: no script, no address, no funding amount
        expect(s.p2shAddresses.simnet).toBe("");
        expect(s.redeemScript).toBe("");
        expect(s.requiredFundingSompi).toBeUndefined();
        const msg = s.issues[0]!.message;
        expect(msg).toMatch(/above the limit 500000 g/);
        expect(msg).toMatch(/locked for ever/);
        const min = s.minimumBoundAmountsSompi!;
        expect(min).toBeDefined();
        // the amount named for the output that is too small fits; 10,000 sompi less does not
        const small: "payout" | "change" = row.change !== undefined && row.change < row.payout ? "change" : "payout";
        const m = min[small]!;
        expect(m, `${small}: ${String(min.payout)} / ${String(min.change)}`).toBeDefined();
        expect(msg).toContain(String(m));
        const rebuilt = small === "payout" ? bound(m, row.change) : bound(row.payout, m);
        expect(rebuilt.ok, JSON.stringify(rebuilt.issues)).toBe(true);
        expect(spend(rebuilt, rebuilt.requiredFundingSompi!).ok).toBe(true);
        const under = small === "payout" ? bound(m - 10_000n, row.change) : bound(row.payout, m - 10_000n);
        expect(codes(under)).toEqual(["ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT"]);
      }
    });
  }

  it("a change of 0.01 KAS: no payout amount can make it fit (C / change alone is 1,000,000 g); the message says so", () => {
    const s = bound(KAS, KAS / 100n);
    expect(s.minimumBoundAmountsSompi?.payout).toBeUndefined();
    expect(s.minimumBoundAmountsSompi?.change).toBeDefined();
    expect(s.issues[0]!.message).toMatch(/no payout amount while the change is/);
  });

  it("the old probe's figure: the funded spend of a 0.05 KAS payout is ~159,000 g, above the 100,000 the spend builder used to refuse at", () => {
    const s = bound(KAS / 20n);
    expect(s.ok).toBe(true);
    const fee = s.requiredFundingSompi! - KAS / 20n;
    expect(s.spendStorageMass).toBe(C / (KAS / 20n) - C / (KAS / 20n + fee));
    expect(s.spendStorageMass! > 100_000n).toBe(true);
  });
});

describe("G1 · buildR0Groth16Transaction: the node's floor and storage limit, both lock modes", () => {
  const proofOnly = buildR0Groth16Scripts({ ...official });

  for (const a of AMOUNTS) {
    it(`proof-only, a payout of ${label(a)} at the recommended fee: ${a >= KAS / 50n ? "ok, no floor warning" : "ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT"}`, () => {
      // the recommended fee for this shape, then a UTXO that leaves exactly `a` as the payout
      const probe = spend(proofOnly, 2n * KAS);
      const fee = probe.feeSompi;
      const t = spend(proofOnly, a + fee);
      expect(t.feeSompi).toBe(fee);
      expect(t.storageMass).toBe(C / a - C / (a + fee));
      expect(t.warnings.map((w) => w.code)).not.toContain("ZK_FEE_BELOW_MEMPOOL_MINIMUM");
      if (a >= KAS / 50n) {
        expect(t.ok, JSON.stringify(t.issues)).toBe(true);
        expect(codes(t)).toEqual([]);
      } else {
        expect(t.ok).toBe(false);
        expect(codes(t)).toEqual(["ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT"]);
        expect(t.issues[0]!.message).toMatch(/spend a larger UTXO or pay a smaller fee/);
      }
    });
  }

  it("proof-only: the floor no longer counts storage mass (0.05 KAS payout at the node's floor exactly: ok; one sompi less: warned)", () => {
    const probe = spend(proofOnly, 2n * KAS);
    const floor = probe.minimumRelayFeeSompi!;
    const at = spend(proofOnly, KAS / 20n + floor, { feeSompi: floor });
    expect(at.ok, JSON.stringify(at.issues)).toBe(true);
    expect(at.warnings.map((w) => w.code)).not.toContain("ZK_FEE_BELOW_MEMPOOL_MINIMUM");
    const under = spend(proofOnly, KAS / 20n + floor, { feeSompi: floor - 1n });
    expect(under.warnings.map((w) => w.code)).toContain("ZK_FEE_BELOW_MEMPOOL_MINIMUM");
    expect(under.warnings.find((w) => w.code === "ZK_FEE_BELOW_MEMPOOL_MINIMUM")!.message).toContain(String(floor));
  });

  it("output-bound: a lock whose funded spend fits but whose largest accepted UTXO does not (storage grows with the input): the over-funded spend is refused, naming the UTXO range that fits", () => {
    const payout = 1_900_000n; // 0.019 KAS
    const s = bound(payout);
    expect(s.ok, JSON.stringify(s.issues)).toBe(true);
    expect(spend(s, s.requiredFundingSompi!).ok).toBe(true);
    const max = boundMaxInputSompi(s.bindingPolicy!);
    const over = spend(s, max);
    expect(over.ok).toBe(false);
    expect(codes(over)).toEqual(["ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT"]);
    const m = over.issues[0]!.message.match(/holding from (\d+) to (\d+) sompi/);
    expect(m, over.issues[0]!.message).not.toBeNull();
    const hi = BigInt(m![2]!);
    expect(spend(s, hi).ok).toBe(true);
    expect(codes(spend(s, hi + 1_000_000n))).toEqual(["ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT"]);
    // build-scripts warned the funder of the same ceiling
    const warning = s.warnings.find((w) => w.code === "ZK_BOUND_LOCK_OVERFUNDING_UNSPENDABLE");
    expect(warning, JSON.stringify(s.warnings.map((w) => w.code))).toBeDefined();
    expect(warning!.message).toContain(`a UTXO above ${hi} sompi`);
    // a lock whose largest accepted UTXO still fits gets no such warning
    expect(bound(KAS).warnings.map((w) => w.code)).not.toContain("ZK_BOUND_LOCK_OVERFUNDING_UNSPENDABLE");
    // still a bound lock: the refusal never calls it unbound
    expect(over.warnings.map((w) => w.code)).not.toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
  });

  it("output-bound: a 0.05 KAS payout funded with requiredFundingSompi is no longer refused (it was: storage counted in the floor and > 100,000 g)", () => {
    const s = bound(KAS / 20n);
    const t = spend(s, s.requiredFundingSompi!);
    expect(t.ok, JSON.stringify(t.issues)).toBe(true);
    expect(t.storageMass! > 100_000n).toBe(true);
    expect(codes(t)).not.toContain("ZK_BOUND_FEE_BELOW_MEMPOOL_MINIMUM");
    expect(codes(t)).not.toContain("ZK_TX_EXCEEDS_MAX_STANDARD_MASS");
  });
});

/** A canonical output-bound lock in HardKAS's layout with any amounts and input limit (as zk-lock-checks-c5-c7-c8 builds). */
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

describe("G1 · verifyR0Groth16Scripts refuses a canonical lock whose cheapest spend is above the storage limit", () => {
  const CAP = 50_000_000n;
  for (const a of AMOUNTS) {
    it(`payout ${label(a)}, input limit = payout + 0.5 KAS: ${a >= KAS / 50n ? "ok" : "ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT"}`, () => {
      const r = verifyR0Groth16Scripts({ ...handBuiltBoundLock([{ address: PAYEE, amountSompi: a }], a + CAP), expectedBindingMode: "proof-and-output-bound", expectedPayoutAddress: PAYEE, expectedPayoutAmount: a });
      expect(r.redeemScriptCanonical).toBe(true);
      if (a >= KAS / 50n) {
        expect(r.ok, JSON.stringify(r.issues)).toBe(true);
        expect(r.consensusEnforced).toBe(true);
      } else {
        expect(r.ok).toBe(false);
        expect(r.consensusEnforced).toBe(false);
        expect(codes(r)).toEqual(["ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT"]);
        expect(r.issues[0]!.message).toMatch(/do not fund it/);
      }
    });
  }

  it("payout 1 KAS + change 0.01 KAS: refused; + change 0.05 KAS: ok", () => {
    const lock = (c: bigint) => handBuiltBoundLock([{ address: PAYEE, amountSompi: KAS }, { address: CHANGE, amountSompi: c }], KAS + c + CAP);
    expect(codes(verifyR0Groth16Scripts(lock(KAS / 100n)))).toEqual(["ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT"]);
    expect(verifyR0Groth16Scripts(lock(KAS / 20n)).ok).toBe(true);
  });

  it("the spend builder on such a lock refuses on its storage mass and does not call the lock unbound", () => {
    const a = KAS / 100n;
    const lock = handBuiltBoundLock([{ address: PAYEE, amountSompi: a }], a + CAP);
    const p2sh = k.payToScriptHashScript(lock.redeemScript);
    const scripts: any = {
      ok: true,
      imageId: official.imageId,
      journalHash: official.journalHash,
      preparedProof: buildR0Groth16Scripts({ ...official }).preparedProof,
      ...lock,
      p2shScriptPublicKey: { version: p2sh.version, script: p2sh.script },
      p2shAddresses: { simnet: k.addressFromScriptPublicKey(p2sh, "simnet").toString() },
      bindingMode: "proof-and-output-bound",
      bindingPolicy: { mode: "proof-and-output-bound", payout: { address: PAYEE, amountSompi: a } }
    };
    const t = spend(scripts, a + 20_000_000n);
    expect(t.ok).toBe(false);
    expect(codes(t)).toEqual(["ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT"]);
    expect(t.issues[0]!.message).toMatch(/can never|will ever be included/);
    expect(t.warnings.map((w) => w.code)).not.toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
  });
});
