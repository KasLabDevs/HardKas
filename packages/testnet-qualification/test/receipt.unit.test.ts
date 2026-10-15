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
    // v3: a PASS needs a satisfied blue-score confirmation (see "Schema v3" below); the generic fixture is UNRESOLVED
    outcome: "UNRESOLVED",
    toolchain: {
      hardkas: { version: "0.12.0-rc.27" },
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
    expect(read.receipt.outcome).toBe("UNRESOLVED");
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

// TQ1-SCRIPT-BROKEN-1 (D7): schema v2 — the attempt record (kept in v3), and v1 no longer read
describe("Schema v2 — submission attempt record (D7)", () => {
  const writeReceipt = async (body: unknown) => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_x_20260915T000000000Z.json");
    await fs.writeFile(filePath, JSON.stringify(body));
    return filePath;
  };
  const body = (evidence: unknown, schemaVersion: number = RAW_RECEIPT_SCHEMA_VERSION) => ({
    schema: RAW_RECEIPT_SCHEMA,
    schemaVersion,
    qualificationId: "x",
    network: "testnet-10",
    startedAt: "2026-09-15T14:00:00.000Z",
    completedAt: "2026-09-15T14:00:05.000Z",
    outcome: "UNRESOLVED",
    toolchain: { hardkas: { version: "0" } },
    evidence
  });

  it("the current raw schema version is 3 (v2's attempt record is kept)", () => {
    expect(RAW_RECEIPT_SCHEMA_VERSION).toBe(3);
  });

  it("a v1 receipt is not read as v2 (its missing attempt record must never mean 'not attempted')", async () => {
    await expect(readRawReceipt(await writeReceipt(body({}, 1)))).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });

  it("round-trips every attempt outcome with its attempts count", async () => {
    const dir = await tmpDir();
    const attempts = [
      { outcome: "not_attempted", attempts: 0, stage: "plan-and-sign", reason: "KEYSTORE_PASSWORD_REQUIRED", recordedAt: "2026-09-15T14:00:01.000Z" },
      { outcome: "outcome_unknown", attempts: 1, stage: "submit", txid: "cc".repeat(32), reason: "unclassified-error-no-positive-observation", recordedAt: "2026-09-15T14:00:02.000Z" }
    ] as const;
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt({ evidence: { submissionAttempts: attempts } }), rawDir: dir });
    const read = await readRawReceipt(persisted.filePath);
    expect(read.receipt.evidence.submissionAttempts).toEqual(attempts);
  });

  for (const [label, attempt] of [
    ["not_attempted with attempts 1", { outcome: "not_attempted", attempts: 1, stage: "submit", recordedAt: "t" }],
    ["outcome_unknown with attempts 0", { outcome: "outcome_unknown", attempts: 0, stage: "submit", recordedAt: "t" }],
    ["an invented outcome (accepted:false style)", { outcome: "not_accepted", attempts: 1, stage: "submit", recordedAt: "t" }]
  ] as const) {
    it(`rejects an inconsistent attempt record: ${label}`, async () => {
      await expect(readRawReceipt(await writeReceipt(body({ submissionAttempts: [attempt] })))).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
    });
  }
});

// TN10-CONFIRMATION-FIX-1: schema v3 — confirmation is blue-score depth of an accepting chain block bound to the UTXO row.
// This build writes v3 only, reads v2 as recorded, and a v3 receipt cannot carry the v2 DAA slots.
describe("Schema v3 — accepting chain block and blue-score confirmation", () => {
  const TX = "cc".repeat(32);
  const BLOCK = "ab".repeat(32);
  const look = {
    observationArtifactId: "ee".repeat(32),
    observedAt: "2026-09-15T14:00:04.000Z",
    observerId: `obs_${"ff".repeat(32)}`,
    point: { sinkHash: "99".repeat(32), sinkBlueScore: "1150", virtualDaaScore: "251" },
    finding: { type: "accepted" as const, acceptingBlockHash: BLOCK, acceptingBlueScore: "1000", acceptingDaaScore: "100", confirmationsBlue: "150" },
    derivedStatus: "CONFIRMED"
  };
  const chainAcceptance = (result: "matches" | "mismatch" = "matches") => ({
    txid: TX,
    method: "virtual-chain-from-submit-start-point" as const,
    startPoint: { sinkHash: "dd".repeat(32), sinkBlueScore: "990", virtualDaaScore: "90", capturedAt: "2026-09-15T14:00:01.000Z" },
    acceptingBlockHash: BLOCK,
    acceptingBlueScore: "1000",
    acceptingDaaScore: "100",
    utxoBinding: { witnessAddress: "kaspatest:qrdest", utxoBlockDaaScore: "100", acceptingDaaScore: "100", result },
    observation: look
  });
  const blueConfirmation = (over: Record<string, unknown> = {}) => ({
    txid: TX,
    acceptingBlockHash: BLOCK,
    acceptingBlueScore: "1000",
    sinkBlueScoreAtObservation: "1150",
    confirmationsBlue: "150",
    unit: "blue-score" as const,
    observedStatus: "CONFIRMED",
    policy: { minConfirmations: "100", unit: "blue-score" as const, requestedVia: "--min-confirmations", satisfied: true },
    observationArtifactId: look.observationArtifactId,
    observedAt: look.observedAt,
    limitations: ["observed through ONE RPC node"],
    ...over
  });
  const pass = (evidence: Record<string, unknown>) => fixtureReceipt({ outcome: "PASS", evidence: evidence as any });

  it("writes v3 only; reads v2 and v3", async () => {
    const { RAW_RECEIPT_READABLE_VERSIONS } = await import("../src/receipt.js");
    expect(RAW_RECEIPT_SCHEMA_VERSION).toBe(3);
    expect([...RAW_RECEIPT_READABLE_VERSIONS]).toEqual([2, 3]);
    await expect(persistRawReceipt({ receipt: fixtureReceipt({ schemaVersion: 2 as any }), rawDir: await tmpDir() })).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
  });

  it("a v2 receipt (block hash from a UTXO row, DAA 'confirmations') is read exactly as recorded, never rewritten", async () => {
    const dir = await tmpDir();
    const filePath = path.join(dir, "TESTNET_QUALIFICATION_testnet-10_20261015T180604720Z.json");
    const v2 = {
      ...fixtureReceipt({ schemaVersion: 2 as any }),
      evidence: {
        inclusions: [{ txid: TX, inclusionBlockHash: BLOCK, inclusionDaaScore: "100", observedAt: "2026-09-15T14:00:03.000Z" }],
        confirmations: [{ txid: TX, inclusionBlockHash: BLOCK, inclusionDaaScore: "100", observedAt: "2026-09-15T14:00:03.000Z", virtualDaaScoreAtObservation: "200", deltaDaa: "100", configuredDaaDelta: "10", criterion: "virtualDaaScore - inclusionDaaScore >= configuredDaaDelta" }]
      }
    };
    const bytes = canonicalizeReceipt(v2 as any);
    await fs.writeFile(filePath, bytes);
    const read = await readRawReceipt(filePath);
    expect(read.receipt.schemaVersion).toBe(2);
    expect(read.digest.value).toBe(sha256Hex(bytes));
    expect(read.receipt.evidence.confirmations?.[0]?.deltaDaa).toBe("100");
    expect((read.receipt.evidence as any).blueConfirmations).toBeUndefined();
    expect(sha256Hex(new Uint8Array(await fs.readFile(filePath)))).toBe(sha256Hex(bytes));
  });

  it("a v3 receipt never carries the v2 DAA slots", async () => {
    for (const legacy of [
      { inclusions: [{ txid: TX, inclusionBlockHash: BLOCK, inclusionDaaScore: "100", observedAt: "x" }] },
      { confirmations: [{ txid: TX, inclusionBlockHash: BLOCK, inclusionDaaScore: "100", observedAt: "x", virtualDaaScoreAtObservation: "200", deltaDaa: "100", configuredDaaDelta: "10", criterion: "c" }] }
    ]) {
      await expect(persistRawReceipt({ receipt: fixtureReceipt({ evidence: legacy as any }), rawDir: await tmpDir() })).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
    }
  });

  it("PASS requires a satisfied blue-score confirmation of a chain block bound to the UTXO row", async () => {
    const refused = [
      pass({}),
      pass({ acceptances: [{ txid: TX, acceptedAt: "x", detectedVia: "mempool-gone+utxo-present", witnessAddress: "kaspatest:qrdest" }] }),
      pass({ chainAcceptances: [chainAcceptance()] }),
      pass({ chainAcceptances: [chainAcceptance("mismatch")], blueConfirmations: [blueConfirmation()] }),
      pass({ blueConfirmations: [blueConfirmation()] }),
      pass({ chainAcceptances: [chainAcceptance()], blueConfirmations: [blueConfirmation({ unit: "daa" })] }),
      pass({ chainAcceptances: [chainAcceptance()], blueConfirmations: [blueConfirmation({ confirmationsBlue: "60" })] }),
      pass({ chainAcceptances: [chainAcceptance()], blueConfirmations: [blueConfirmation({ confirmationsBlue: "60", policy: { minConfirmations: "100", unit: "blue-score", requestedVia: "x", satisfied: false } })] })
    ];
    for (const receipt of refused) {
      await expect(persistRawReceipt({ receipt, rawDir: await tmpDir() }), JSON.stringify(receipt.evidence).slice(0, 200)).rejects.toMatchObject({ reason: "SCHEMA_INVALID" });
    }
  });

  it("a PASS with a bound, satisfied blue-score confirmation round-trips", async () => {
    const receipt = pass({ chainAcceptances: [chainAcceptance()], blueConfirmations: [blueConfirmation()] });
    const persisted = await persistRawReceipt({ receipt, rawDir: await tmpDir() });
    const read = await readRawReceipt(persisted.filePath);
    expect(read.receipt.schemaVersion).toBe(3);
    expect(read.receipt.evidence.blueConfirmations?.[0]).toMatchObject({ confirmationsBlue: "150", unit: "blue-score", policy: { satisfied: true } });
    expect(read.receipt.evidence.chainAcceptances?.[0]?.utxoBinding.result).toBe("matches");
  });
});
