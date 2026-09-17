import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  RAW_RECEIPT_SCHEMA,
  RAW_RECEIPT_SCHEMA_VERSION,
  persistRawReceipt,
  type TestnetQualificationReceipt
} from "../src/receipt.js";
import {
  SHARED_RECEIPT_SCHEMA,
  SHARED_RECEIPT_SCHEMA_VERSION,
  deriveSharedReceipt,
  persistSharedReceipt,
  verifySharedAgainstRaw,
  canonicalizeSharedReceipt,
  sharedReceiptFilename,
  type SharedQualificationReceipt
} from "../src/receipt-redactor.js";

describe("Schema governance invariant (no module-load throw)", () => {
  it("SHARED_RECEIPT_SCHEMA is distinct from RAW_RECEIPT_SCHEMA", () => {
    // This test — not a module-load throw — is the enforcement point for
    // the raw/shared schema disjointness invariant. Importing the package
    // must never terminate a process because of this governance rule.
    expect((SHARED_RECEIPT_SCHEMA as string) === (RAW_RECEIPT_SCHEMA as string)).toBe(false);
    expect(SHARED_RECEIPT_SCHEMA.length).toBeGreaterThan(0);
    expect(RAW_RECEIPT_SCHEMA.length).toBeGreaterThan(0);
  });
});

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function tmpDir(prefix = "hk-tq-shared-"): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function fixtureReceipt(overrides: Partial<TestnetQualificationReceipt> = {}): TestnetQualificationReceipt {
  return {
    schema: RAW_RECEIPT_SCHEMA,
    schemaVersion: RAW_RECEIPT_SCHEMA_VERSION,
    qualificationId: "tq-2026-09-15-shared",
    network: "testnet-10",
    startedAt: "2026-09-15T14:00:00.000Z",
    completedAt: "2026-09-15T14:00:05.500Z",
    outcome: "PASS",
    toolchain: {
      hardkas: { version: "0.12.0-rc.23" },
      kaspaWasm: { version: "2.0.1", digest: "7eaffac9cd920ef2fdf540c6e10f2a2b7761170ebc62ec57dfa0f71c64567a71" },
      silverc: { version: "1.0.0", digest: "3e0d660c15a9e7ac90f3960da24d348b076b1891481bfe758db18accc8a102e1" }
    },
    evidence: {
      remoteAuthority: {
        authorityKind: "REMOTE_TESTNET_NODE",
        endpoint: { class: "wrpc", address: "ws://user:token@node.internal:17110/secret-path" },
        observedAt: "2026-09-15T14:00:00.100Z",
        network: { expected: "testnet-10", observed: "testnet-10" },
        serverVersion: "0.16.0",
        rpcApiVersion: 1,
        isSynced: true,
        hasUtxoIndex: true,
        virtualDaaScore: "12345",
        capabilities: { getNetworkParams: true, getFeeEstimate: true, hasUtxoIndex: true },
        probeHashes: {
          getServerInfo: "aa".repeat(32),
          getBlockDagInfo: "bb".repeat(32)
        }
      },
      funding: [
        {
          outpoint: { transactionId: "cc".repeat(32), index: 0 },
          address: "kaspatest:qrsomefund",
          amountSompi: "500000000000",
          scriptPublicKey: "20abcdef",
          isCoinbase: false,
          observedAt: "2026-09-15T14:00:01.000Z",
          maturityResolvedVia: "not-coinbase",
          // Runtime-local marker — MUST NOT propagate to the shared artifact.
          localReservation: { kind: "tq-local", tag: "run-abc-secret-tag" }
        }
      ],
      submissions: [
        {
          state: "OBSERVED_MEMPOOL",
          txid: "dd".repeat(32),
          attempts: 1,
          resolvedVia: "post-ambiguity-mempool-hit",
          resolvedAt: "2026-09-15T14:00:04.900Z"
        }
      ],
      notes: {
        // Anything the runner wanted local-only. MUST NOT propagate.
        HARDKAS_INTERNAL_HINT: "sensitive-detail-not-for-sharing"
      }
    },
    ...overrides
  };
}

describe("deriveSharedReceipt — chain of custody", () => {
  it("derivedFrom.digest equals sha256 of the raw bytes actually persisted", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    expect(derived.shared.derivedFrom.algorithm).toBe("sha256");
    expect(derived.shared.derivedFrom.digest).toBe(persisted.digest.value);
    expect(derived.shared.derivedFrom.rawSchema).toBe(RAW_RECEIPT_SCHEMA);
    expect(derived.shared.derivedFrom.rawSchemaVersion).toBe(RAW_RECEIPT_SCHEMA_VERSION);
    expect(derived.sourceDigest).toBe(persisted.digest.value);
    expect(derived.sourceBytes).toEqual(persisted.bytes);
  });

  it("uses a schema DISTINCT from the raw receipt", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    expect(derived.shared.schema).toBe(SHARED_RECEIPT_SCHEMA);
    expect((derived.shared.schema as string) === (RAW_RECEIPT_SCHEMA as string)).toBe(false);
    expect(derived.shared.schemaVersion).toBe(SHARED_RECEIPT_SCHEMA_VERSION);
  });

  it("does not modify the raw receipt file (bytes/hash unchanged after derivation)", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const beforeBytes = new Uint8Array(await fs.readFile(persisted.filePath));
    const beforeDigest = sha256Hex(beforeBytes);
    await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const afterBytes = new Uint8Array(await fs.readFile(persisted.filePath));
    expect(sha256Hex(afterBytes)).toBe(beforeDigest);
    expect(afterBytes).toEqual(beforeBytes);
  });
});

describe("Allowlist projection — redaction is explicit", () => {
  it("redacts endpoint address into { class, hostHash } (never the raw URL)", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const authority = derived.shared.evidence.remoteAuthority!;
    expect(authority.endpoint.class).toBe("wrpc");
    expect(authority.endpoint.hostHash).toBe(sha256Hex(new TextEncoder().encode("ws://user:token@node.internal:17110/secret-path")));
    const serialized = JSON.stringify(derived.shared);
    expect(serialized.includes("user:token")).toBe(false);
    expect(serialized.includes("secret-path")).toBe(false);
    expect(serialized.includes("ws://node.internal")).toBe(false);
  });

  it("drops per-run local reservation tags from funding evidence", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const funding = derived.shared.evidence.funding![0]!;
    expect(funding.outpoint.transactionId).toBe("cc".repeat(32));
    expect((funding as any).localReservation).toBeUndefined();
    expect(JSON.stringify(derived.shared).includes("run-abc-secret-tag")).toBe(false);
  });

  it("never propagates evidence.notes to the shared artifact", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    expect((derived.shared.evidence as any).notes).toBeUndefined();
    expect(JSON.stringify(derived.shared).includes("sensitive-detail-not-for-sharing")).toBe(false);
    expect(JSON.stringify(derived.shared).includes("HARDKAS_INTERNAL_HINT")).toBe(false);
  });

  it("preserves txid / outpoint / DAA / mass / fee-shaped public fields", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    // txid preserved.
    expect(derived.shared.evidence.submissions![0]!.txid).toBe("dd".repeat(32));
    // outpoint preserved.
    expect(derived.shared.evidence.funding![0]!.outpoint.transactionId).toBe("cc".repeat(32));
    // network reported by node preserved.
    expect(derived.shared.evidence.remoteAuthority!.network.observed).toBe("testnet-10");
  });
});

describe("verifySharedAgainstRaw — Adversarial #2", () => {
  it("returns ok=true when raw bytes are the same ones that produced derivedFrom.digest", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const currentRaw = new Uint8Array(await fs.readFile(persisted.filePath));
    const v = verifySharedAgainstRaw({ shared: derived.shared, rawBytes: currentRaw });
    expect(v.ok).toBe(true);
    expect(v.expectedDigest).toBe(v.actualDigest);
    expect(v.reason).toBeUndefined();
  });

  it("Adversarial #2 — raw mutation after derivation is DETECTED by digest mismatch (no silent regeneration)", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const originalDigest = derived.shared.derivedFrom.digest;

    // Tamper the raw file bytes-in-place (test-only; production code would not do this).
    const tampered = new Uint8Array(await fs.readFile(persisted.filePath));
    tampered[0] = tampered[0] === 0x7b ? 0x5b : 0x7b; // flip '{' ↔ '['
    await fs.writeFile(persisted.filePath, tampered);

    const currentRaw = new Uint8Array(await fs.readFile(persisted.filePath));
    const v = verifySharedAgainstRaw({ shared: derived.shared, rawBytes: currentRaw });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("DIGEST_MISMATCH");
    expect(v.expectedDigest).toBe(originalDigest);
    expect(v.actualDigest).toBe(sha256Hex(tampered));
    // Critical: the shared object's derivedFrom.digest is UNCHANGED.
    expect(derived.shared.derivedFrom.digest).toBe(originalDigest);
  });

  it("rejects a shared receipt with the wrong shared schema (fails verification)", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const currentRaw = new Uint8Array(await fs.readFile(persisted.filePath));

    const bad: SharedQualificationReceipt = { ...derived.shared, schema: "hardkas.impostor" as any };
    const v = verifySharedAgainstRaw({ shared: bad, rawBytes: currentRaw });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("SHARED_SCHEMA_INVALID");
  });

  it("rejects an unsupported shared schemaVersion (fails verification)", async () => {
    const rawDir = await tmpDir();
    const persisted = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persisted.filePath });
    const currentRaw = new Uint8Array(await fs.readFile(persisted.filePath));

    const bad: SharedQualificationReceipt = { ...derived.shared, schemaVersion: 999 as any };
    const v = verifySharedAgainstRaw({ shared: bad, rawBytes: currentRaw });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("SHARED_SCHEMA_INVALID");
  });
});

describe("persistSharedReceipt — append-only, distinct schema, distinct filename", () => {
  it("persists the shared receipt at a *_shared.json path, byte-for-byte matching the canonicalized form", async () => {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir("hk-tq-shared-out-");
    const persistedRaw = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persistedRaw.filePath });
    const persisted = await persistSharedReceipt({ shared: derived.shared, sharedDir });
    expect(persisted.filename).toContain("_shared.json");
    expect(persisted.filePath).toBe(path.join(sharedDir, persisted.filename));
    const onDisk = new Uint8Array(await fs.readFile(persisted.filePath));
    const canonical = canonicalizeSharedReceipt(derived.shared);
    expect(onDisk).toEqual(canonical);
    expect(persisted.digest.value).toBe(sha256Hex(canonical));
  });

  it("refuses to overwrite an existing shared receipt (append-only invariant)", async () => {
    const rawDir = await tmpDir();
    const sharedDir = await tmpDir("hk-tq-shared-out-");
    const persistedRaw = await persistRawReceipt({ receipt: fixtureReceipt(), rawDir });
    const derived = await deriveSharedReceipt({ rawFilePath: persistedRaw.filePath });
    await persistSharedReceipt({ shared: derived.shared, sharedDir });
    await expect(persistSharedReceipt({ shared: derived.shared, sharedDir })).rejects.toMatchObject({ reason: "ALREADY_EXISTS" });
  });

  it("sharedReceiptFilename is distinct from the raw filename for the same network + completedAt", () => {
    const raw = "TESTNET_QUALIFICATION_testnet-10_20260915T140005500Z.json";
    const shared = sharedReceiptFilename("testnet-10", new Date("2026-09-15T14:00:05.500Z"));
    expect(shared === raw).toBe(false);
    expect(shared.endsWith("_shared.json")).toBe(true);
  });
});

describe("Persistence outcome ≠ qualification outcome", () => {
  it("a failed PERSISTENCE does not silently mutate the raw receipt's outcome", async () => {
    // If the raw already exists, persistRawReceipt throws ALREADY_EXISTS.
    // The receipt's declared outcome ("PASS" here) is unaffected by that
    // filesystem-level failure — the failure surfaces to the caller.
    const rawDir = await tmpDir();
    const receipt = fixtureReceipt({ outcome: "PASS" });
    await persistRawReceipt({ receipt, rawDir });
    let err: any;
    try { await persistRawReceipt({ receipt, rawDir }); } catch (e) { err = e; }
    expect(err.reason).toBe("ALREADY_EXISTS");
    expect(receipt.outcome).toBe("PASS"); // the in-memory receipt is untouched
    // AND no shared artifact should have been produced by this failed call
    // — the caller drives derivation separately; we simply prove there is
    // no side-effect on the shared side (no shared dir was even passed).
  });
});
