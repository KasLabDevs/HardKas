import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadManagedKaspaWasmSync } from "@hardkas/core";
import {
  buildR0Groth16Scripts,
  buildR0Groth16Plan,
  buildR0Groth16Transaction,
  parseR0Groth16Receipt,
  verifyR0Groth16ReceiptLocal
} from "../src/index.js";
import * as bn from "../src/zk/bn254.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const ZK = path.resolve(here, "../../../fixtures/toccata-v2/zk/r0-groth16-official");
const imageId: string = JSON.parse(fs.readFileSync(path.join(ZK, "image-id.json"), "utf8")).imageId;
const journalHash: string = JSON.parse(fs.readFileSync(path.join(ZK, "journal.json"), "utf8")).journalHash;
const officialReceiptHex = fs.readFileSync(path.join(ZK, "receipt.hex"), "utf8").trim();
const k: any = loadManagedKaspaWasmSync();
const simnetAddr = (seed: string) => new k.PrivateKey(seed.repeat(32)).toAddress("simnet").toString();

function unprunedTag0Receipt(): string {
  const b = Buffer.from(officialReceiptHex, "hex");
  const head = b.subarray(0, 4 + 256);
  const verifierParameters = b.subarray(4 + 256 + 1 + 32);
  const sha = (...p: Buffer[]) => createHash("sha256").update(Buffer.concat(p)).digest();
  const tagged = (tag: string, down: Buffer[], data: number[]) => {
    const u32 = data.map((d) => {
      const x = Buffer.alloc(4);
      x.writeUInt32LE(d);
      return x;
    });
    const n = Buffer.alloc(2);
    n.writeUInt16LE(down.length);
    return sha(sha(Buffer.from(tag)), ...down, ...u32, n);
  };
  const zero = Buffer.alloc(32);
  const post = tagged("risc0.SystemState", [zero], [0]);
  const output = tagged("risc0.Output", [Buffer.from(journalHash, "hex"), zero], []);
  const pruned = (d: Buffer) => Buffer.concat([Buffer.from([1]), d]);
  const claim = Buffer.concat([pruned(Buffer.from(imageId, "hex")), pruned(post), Buffer.from([0, 0, 0, 0, 0]), pruned(zero), pruned(output)]);
  return Buffer.concat([head, Buffer.from([0]), claim, verifierParameters]).toString("hex");
}

describe("Priority 4 · ZK hardening regressions", () => {
  it("parseR0Groth16Receipt rejects tag===0 (UNPRUNED_VALUE) fail-closed and blocks verifyR0Groth16ReceiptLocal bypass", async () => {
    const tag0 = unprunedTag0Receipt();
    const parsed = parseR0Groth16Receipt(tag0);
    expect(parsed.ok).toBe(false);
    expect(parsed.claimEncoding).toBe("UNPRUNED_VALUE");
    expect(parsed.issues.length).toBeGreaterThan(0);

    // Must not verify an unpruned receipt with unchecked verifierParameters / claim
    const verified = await verifyR0Groth16ReceiptLocal({
      imageId,
      journalHash,
      receiptHex: tag0
    });
    expect(verified.ok).toBe(false);
    expect(verified.verified).toBe(false);
  });

  it("buildR0Groth16Plan requires utxo.amountSompi > feeSompi > 0", () => {
    const scripts = buildR0Groth16Scripts({ imageId, journalHash, receiptHex: officialReceiptHex });
    expect(scripts.ok).toBe(true);
    const dest = simnetAddr("44");

    // amountSompi equal to feeSompi -> output would be 0
    expect(() =>
      buildR0Groth16Plan({
        scripts,
        utxo: { transactionId: "aa".repeat(32), index: 0, amountSompi: 500_000n },
        destinationAddress: dest,
        feeSompi: 500_000n,
        networkId: "simnet"
      })
    ).toThrow(/ZK_INSUFFICIENT_INPUT_AMOUNT/);

    // amountSompi below feeSompi -> output would be negative
    expect(() =>
      buildR0Groth16Plan({
        scripts,
        utxo: { transactionId: "aa".repeat(32), index: 0, amountSompi: 400_000n },
        destinationAddress: dest,
        feeSompi: 500_000n,
        networkId: "simnet"
      })
    ).toThrow(/ZK_INSUFFICIENT_INPUT_AMOUNT/);

    // feeSompi <= 0
    expect(() =>
      buildR0Groth16Plan({
        scripts,
        utxo: { transactionId: "aa".repeat(32), index: 0, amountSompi: 100_000_000n },
        destinationAddress: dest,
        feeSompi: 0n,
        networkId: "simnet"
      })
    ).toThrow(/ZK_INSUFFICIENT_INPUT_AMOUNT/);
  });

  it("ZK_BINDING_LABEL_NOT_ENFORCED rejects buildR0Groth16Transaction (ok:false) rather than warning only", () => {
    const payee = simnetAddr("44");
    const proofOnly = buildR0Groth16Scripts({ imageId, journalHash, receiptHex: officialReceiptHex });
    const relabelled = {
      ...proofOnly,
      bindingMode: "proof-and-output-bound" as const,
      bindingPolicy: { mode: "proof-and-output-bound" as const, payout: { address: payee, amountSompi: 100_000_000n } },
      consensusEnforced: true
    };
    const res = buildR0Groth16Transaction({
      scripts: relabelled as any,
      utxo: { transactionId: "11".repeat(32), index: 0, amountSompi: 120_000_000n },
      destinationAddress: payee,
      networkId: "simnet"
    });
    expect(res.ok).toBe(false);
    expect(res.consensusEnforced).toBe(false);
    expect(res.transaction).toBeNull();
    expect(res.issues.map((i) => i.code)).toContain("ZK_BINDING_LABEL_NOT_ENFORCED");
  });

  it("bn254 enforces field [0, Q) ranges on curve checks and compression, and handles negative scalar in g2Mul", () => {
    const Q = bn.BN254_Q;
    // Generator on BN254 G1 is (1, 2)
    expect(bn.g1IsOnCurve({ x: 1n, y: 2n, infinity: false })).toBe(true);
    expect(bn.g1IsOnCurve({ x: 1n + Q, y: 2n, infinity: false })).toBe(false);
    expect(bn.g1IsOnCurve({ x: 1n, y: -2n, infinity: false })).toBe(false);
    expect(() => bn.g1Compress({ x: 1n + Q, y: 2n, infinity: false })).toThrow(RangeError);

    // G2 valid point via decompression of generator or scaled G2
    const g2 = bn.g2Mul({ x: [10857046999023057135944570762232829481370756359578518086990519993285655852781n, 11559732032986387107991004021392285783925812861821192530917403151452391805634n], y: [8495653923123431417604973247489272438418190587263600148770280649306958101930n, 4082367875863433681332203403145435568316851327593401208105741076214120093531n], infinity: false }, 1n);
    expect(bn.g2IsOnCurve(g2)).toBe(true);
    expect(bn.g2IsOnCurve({ ...g2, x: [g2.x[0] + Q, g2.x[1]] })).toBe(false);
    expect(bn.g2IsOnCurve({ ...g2, y: [-g2.y[0], g2.y[1]] })).toBe(false);
    expect(() => bn.g2Compress({ ...g2, x: [g2.x[0] + Q, g2.x[1]] })).toThrow(RangeError);

    // Negative scalar in g2Mul should match g2Mul(g2, BN254_R - 1n) (the inverse point)
    const negG2 = bn.g2Mul(g2, -1n);
    const invG2 = bn.g2Mul(g2, bn.BN254_R - 1n);
    expect(negG2).toEqual(invG2);
    expect(bn.g2IsOnCurve(negG2)).toBe(true);
  });
});
