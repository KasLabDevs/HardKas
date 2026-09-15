import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  RAW_RECEIPT_SCHEMA,
  RAW_RECEIPT_SCHEMA_VERSION,
  ReceiptPersistenceError,
  canonicalizeReceipt,
  toReceiptJsonSafe,
  sanitizeNetworkForFs,
  formatUtcTimestampForFilename,
  receiptFilename,
  persistRawReceipt,
  readRawReceipt,
  type TestnetQualificationReceipt
} from "../src/receipt.js";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function tmpDir(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), "hk-tq-receipt-"));
}

function fixtureReceipt(overrides: Partial<TestnetQualificationReceipt> = {}): TestnetQualificationReceipt {
  const base: TestnetQualificationReceipt = {
    schema: RAW_RECEIPT_SCHEMA,
    schemaVersion: RAW_RECEIPT_SCHEMA_VERSION,
    qualificationId: "tq-2026-09-15-abc",
    network: "testnet-10",
    startedAt: "2026-09-15T14:00:00.000Z",
    completedAt: "2026-09-15T14:00:05.123Z",
    outcome: "PASS",
    toolchain: {
      hardkas: { version: "0.12.0-rc.21" },
      kaspaWasm: { version: "2.0.1", digest: "7eaffac9cd920ef2fdf540c6e10f2a2b7761170ebc62ec57dfa0f71c64567a71" }
    },
    evidence: {
      submissions: [
        {
          state: "OBSERVED_MEMPOOL",
          txid: "cc".repeat(32),
          attempts: 1,
          resolvedVia: "post-ambiguity-mempool-hit",
          resolvedAt: "2026-09-15T14:00:04.900Z"
        }
      ]
    },
    ...overrides
  };
  return base;
}

describe("canonicalizeReceipt — determinism", () => {
  it("produces byte-identical output for structurally-equal inputs", () => {
    const a = canonicalizeReceipt(fixtureReceipt());
    const b = canonicalizeReceipt(fixtureReceipt());
    expect(a.length).toBe(b.length);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it("produces different bytes when a payload field changes", () => {
    const a = canonicalizeReceipt(fixtureReceipt({ outcome: "PASS" }));
    const b = canonicalizeReceipt(fixtureReceipt({ outcome: "FAIL" }));
    expect(sha256Hex(a) === sha256Hex(b)).toBe(false);
  });

  it("sorts keys at every depth, omits undefined, and stringifies bigints", () => {
    // toReceiptJsonSafe covers this behavior explicitly.
    const input = { z: 1n, a: { c: 2n, b: 3n, x: undefined } };
    const safe = toReceiptJsonSafe(input) as any;
    expect(Object.keys(safe)).toEqual(["a", "z"]);
    expect(Object.keys(safe.a)).toEqual(["b", "c"]);
    expect(safe.a.b).toBe("3");
    expect(safe.a.c).toBe("2");
    expect(safe.z).toBe("1");
    expect("x" in safe.a).toBe(false);
  });

  it("ends the canonical byte sequence with a single trailing newline", () => {
    const bytes = canonicalizeReceipt(fixtureReceipt());
    expect(bytes[bytes.length - 1]).toBe(0x0a);
    // No penultimate newline.
    expect(bytes[bytes.length - 2] === 0x0a).toBe(false);
  });
});

describe("sanitizeNetworkForFs + receiptFilename — deterministic formatting", () => {
  it("normalises out-of-alphabet characters and preserves safe ones", () => {
    expect(sanitizeNetworkForFs("testnet-10")).toBe("testnet-10");
    expect(sanitizeNetworkForFs("test net/10")).toBe("test_net_10");
    expect(sanitizeNetworkForFs("../etc/passwd")).toBe(".._etc_passwd");
    expect(sanitizeNetworkForFs("")).toBe("unknown");
  });

  it("formats UTC timestamps sortably: 2026-09-15T07:15:30.123Z → 20260915T071530123Z", () => {
    expect(formatUtcTimestampForFilename(new Date("2026-09-15T07:15:30.123Z"))).toBe("20260915T071530123Z");
  });

  it("composes canonical filename shape", () => {
    const name = receiptFilename("testnet-10", new Date("2026-09-15T07:15:30.123Z"));
    expect(name).toBe("TESTNET_QUALIFICATION_testnet-10_20260915T071530123Z.json");
  });

  it("is fs-safe even under adversarial network strings", () => {
    const name = receiptFilename("../../etc/passwd", new Date("2026-09-15T00:00:00.000Z"));
    expect(name.includes("/")).toBe(false);
    expect(name.includes("\\")).toBe(false);
    expect(name.startsWith("TESTNET_QUALIFICATION_")).toBe(true);
    expect(name.endsWith(".json")).toBe(true);
  });
});

describe("persistRawReceipt — immutability", () => {
  it("writes the exact canonical bytes and reports sha256 over the read-back bytes", async () => {
    const dir = await tmpDir();
    const receipt = fixtureReceipt();
    const persisted = await persistRawReceipt({ receipt, rawDir: dir });

    const canonical = canonicalizeReceipt(receipt);
    const onDisk = new Uint8Array(await fs.readFile(persisted.filePath));
    expect(onDisk).toEqual(canonical);
    expect(persisted.digest.value).toBe(sha256Hex(onDisk));
    expect(persisted.digest.algorithm).toBe("sha256");
    expect(persisted.filename).toContain("TESTNET_QUALIFICATION_testnet-10_");
  });

  it("Adversarial #1 — refuses to overwrite an existing raw receipt, and leaves the original bytes intact", async () => {
    const dir = await tmpDir();
    const receipt = fixtureReceipt();
    const filename = receiptFilename(receipt.network, new Date(receipt.completedAt));
    const filePath = path.join(dir, filename);
    // Pre-create the exact target with known bytes.
    const decoyBytes = new TextEncoder().encode("decoy content that must not be overwritten\n");
    await fs.writeFile(filePath, decoyBytes);
    const decoyDigest = sha256Hex(decoyBytes);

    let thrown: unknown;
    try {
      await persistRawReceipt({ receipt, rawDir: dir });
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(ReceiptPersistenceError);
    expect((thrown as ReceiptPersistenceError).reason).toBe("ALREADY_EXISTS");

    const still = new Uint8Array(await fs.readFile(filePath));
    expect(sha256Hex(still)).toBe(decoyDigest);
    expect(still).toEqual(decoyBytes);
  });

  it("Same raw bytes always produce the same sha256; different bytes produce different sha256", () => {
    const a = canonicalizeReceipt(fixtureReceipt());
    const a2 = canonicalizeReceipt(fixtureReceipt());
    const b = canonicalizeReceipt(fixtureReceipt({ qualificationId: "tq-different" }));
    expect(sha256Hex(a)).toBe(sha256Hex(a2));
    expect(sha256Hex(a) === sha256Hex(b)).toBe(false);
  });
});

describe("readRawReceipt — schema validation", () => {
  it("returns the exact bytes on disk, their sha256, and the parsed receipt", async () => {
    const dir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir: dir });
    const read = await readRawReceipt(persisted.filePath);
    expect(sha256Hex(read.bytes)).toBe(persisted.digest.value);
    expect(read.receipt.qualificationId).toBe("tq-2026-09-15-abc");
    expect(read.receipt.outcome).toBe("PASS");
  });

  it("Malformed raw JSON fails closed with SCHEMA_INVALID", async () => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_x_20260915T000000000Z.json");
    await fs.writeFile(filePath, "not json {");
    let thrown: unknown;
    try { await readRawReceipt(filePath); } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(ReceiptPersistenceError);
    expect((thrown as ReceiptPersistenceError).reason).toBe("SCHEMA_INVALID");
  });

  it("Unsupported raw schema (wrong name) fails closed", async () => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_x_20260915T000000000Z.json");
    await fs.writeFile(filePath, JSON.stringify({ schema: "wrong.schema", schemaVersion: 1 }));
    await expect(readRawReceipt(filePath)).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });

  it("Unsupported raw schemaVersion fails closed", async () => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_x_20260915T000000000Z.json");
    await fs.writeFile(filePath, JSON.stringify({ schema: RAW_RECEIPT_SCHEMA, schemaVersion: 999 }));
    await expect(readRawReceipt(filePath)).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });

  it("Rejects a receipt missing required top-level fields", async () => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_x_20260915T000000000Z.json");
    await fs.writeFile(
      filePath,
      JSON.stringify({ schema: RAW_RECEIPT_SCHEMA, schemaVersion: RAW_RECEIPT_SCHEMA_VERSION, qualificationId: "x" })
    );
    await expect(readRawReceipt(filePath)).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });

  it("Rejects a receipt with an unknown outcome value", async () => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_x_20260915T000000000Z.json");
    await fs.writeFile(
      filePath,
      JSON.stringify({
        schema: RAW_RECEIPT_SCHEMA,
        schemaVersion: RAW_RECEIPT_SCHEMA_VERSION,
        qualificationId: "x",
        network: "testnet-10",
        startedAt: "2026-09-15T14:00:00.000Z",
        completedAt: "2026-09-15T14:00:05.000Z",
        outcome: "PROBABLY_OK",
        toolchain: { hardkas: { version: "0" } },
        evidence: {}
      })
    );
    await expect(readRawReceipt(filePath)).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });
});

describe("Observation semantics — never strengthened by the receipt layer", () => {
  it("preserves SubmissionOutcome.state verbatim (OBSERVED_MEMPOOL stays an observation)", async () => {
    const dir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir: dir });
    const read = await readRawReceipt(persisted.filePath);
    expect(read.receipt.evidence.submissions![0]!.state).toBe("OBSERVED_MEMPOOL");
    // The receipt layer must not have re-labelled it as "confirmed" / "final".
    const serialized = JSON.stringify(read.receipt);
    expect(/"confirmed"/i.test(serialized)).toBe(false);
    expect(/"final"/i.test(serialized)).toBe(false);
    expect(/"consensus-valid"/i.test(serialized)).toBe(false);
  });
});
