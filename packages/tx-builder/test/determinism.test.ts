import { describe, it, expect } from "vitest";
import { buildPaymentPlan, createMockUtxo, Utxo } from "../src/index.js";
import { createHash } from "node:crypto";

// Self-contained canonical serialization matching @hardkas/artifacts v3 exactly
export const CURRENT_HASH_VERSION = 3;
export const ARTIFACT_VERSION = "1.0.0-alpha";

export const SEMANTIC_EXCLUSIONS = new Set([
  "contentHash",
  "artifactId",
  "planId",
  "lineage",
  "createdAt",
  "rpcUrl",
  "rpcHost",
  "latencyMs",
  "indexedAt",
  "file_path",
  "file_mtime_ms",
  "hardkasVersion",
  "hashVersion", // Exclude hash version from hash
  "parentArtifactId",
  "signedId",
  "deployedAt",
  "tracePath",
  "receiptPath",
  "events",
  "status",
  "sourceSignedId",
  "submittedAt",
  "confirmedAt",
  "dagContext"
]);

export function canonicalStringify(
  obj: any,
  version: number = CURRENT_HASH_VERSION
): string {
  if (obj === null || typeof obj !== "object") {
    if (typeof obj === "bigint") {
      if (version >= 2) {
        return JSON.stringify(`n:${obj.toString()}`);
      }
      return JSON.stringify(obj.toString());
    }

    if (typeof obj === "string" && version >= 3) {
      const normalized = obj.normalize("NFC").replace(/\r\n/g, "\n");
      return JSON.stringify(normalized);
    }

    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return "[" + obj.map((item) => canonicalStringify(item, version)).join(",") + "]";
  }

  const sortedKeys = Object.keys(obj)
    .filter((key) => !SEMANTIC_EXCLUSIONS.has(key) && obj[key] !== undefined)
    .sort();

  const result = sortedKeys
    .map((key) => {
      const value = obj[key];
      return JSON.stringify(key) + ":" + canonicalStringify(value, version);
    })
    .join(",");

  return "{" + result + "}";
}

export function calculateContentHash(
  obj: any,
  version: number = CURRENT_HASH_VERSION
): string {
  const canonical = canonicalStringify(obj, version);
  return createHash("sha256").update(canonical).digest("hex");
}

function must<T>(value: T | undefined, label: string): T {
  if (value === undefined) {
    throw new Error(`Missing test fixture value: ${label}`);
  }
  return value;
}

// Helper to shuffle array
function shuffle<T>(items: readonly T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = arr[i];
    const target = arr[j];

    if (current === undefined || target === undefined) {
      throw new Error("shuffle invariant failed");
    }

    arr[i] = target;
    arr[j] = current;
  }
  return arr;
}

describe("P1.12 Deterministic Transaction Canonicalization", () => {
  // Setup standard inputs and outputs
  const mockFrom = "kaspa:alice";
  const mockTo = "kaspa:bob";

  // Create a base set of available UTXOs with varying values, txIds, and indices
  const utxos: Utxo[] = [
    {
      outpoint: {
        transactionId: "tx00000000000000000000000000000000000000000000000000000000000002",
        index: 1
      },
      address: mockFrom,
      amountSompi: 1000000n,
      scriptPublicKey: "mock-spk"
    },
    {
      outpoint: {
        transactionId: "tx00000000000000000000000000000000000000000000000000000000000001",
        index: 0
      },
      address: mockFrom,
      amountSompi: 1000000n, // Equal value to test tie-breaker
      scriptPublicKey: "mock-spk"
    },
    {
      outpoint: {
        transactionId: "tx00000000000000000000000000000000000000000000000000000000000002",
        index: 0
      },
      address: mockFrom,
      amountSompi: 1000000n, // Equal value, different index to test tie-breaker
      scriptPublicKey: "mock-spk"
    },
    {
      outpoint: {
        transactionId: "tx00000000000000000000000000000000000000000000000000000000000003",
        index: 0
      },
      address: mockFrom,
      amountSompi: 5000000n, // Higher value
      scriptPublicKey: "mock-spk"
    },
    {
      outpoint: {
        transactionId: "tx00000000000000000000000000000000000000000000000000000000000004",
        index: 0
      },
      address: mockFrom,
      amountSompi: 200000n, // Lower value
      scriptPublicKey: "mock-spk"
    }
  ];

  // Recipient outputs
  const outputs = [
    { address: mockTo, amountSompi: 2500000n },
    { address: "kaspa:charlie", amountSompi: 100000n }
  ];

  it("Test A: RPC Order Randomization - shuffles available UTXOs and produces identical plans", () => {
    const plans: string[] = [];

    for (let i = 0; i < 100; i++) {
      const shuffledUtxos = shuffle(utxos);
      const plan = buildPaymentPlan({
        fromAddress: mockFrom,
        outputs,
        availableUtxos: shuffledUtxos,
        feeRateSompiPerMass: 1n,
        changeAddress: mockFrom
      });

      // Verify selected inputs are canonically sorted: amountSompi ASC, txid ASC, index ASC
      for (let j = 0; j < plan.inputs.length - 1; j++) {
        const current = must(plan.inputs[j], `plan.inputs[${j}]`);
        const next = must(plan.inputs[j + 1], `plan.inputs[${j + 1}]`);
        if (current.amountSompi === next.amountSompi) {
          if (current.outpoint.transactionId === next.outpoint.transactionId) {
            expect(current.outpoint.index).toBeLessThan(next.outpoint.index);
          } else {
            expect(current.outpoint.transactionId < next.outpoint.transactionId).toBe(
              true
            );
          }
        } else {
          expect(current.amountSompi).toBeLessThan(next.amountSompi);
        }
      }

      // Verify recipient outputs are canonically sorted: amountSompi ASC, address ASC
      for (let j = 0; j < plan.outputs.length - 1; j++) {
        const current = must(plan.outputs[j], `plan.outputs[${j}]`);
        const next = must(plan.outputs[j + 1], `plan.outputs[${j + 1}]`);
        if (current.amountSompi === next.amountSompi) {
          expect(current.address < next.address).toBe(true);
        } else {
          expect(current.amountSompi).toBeLessThan(next.amountSompi);
        }
      }

      // Keep stringified representation to assert absolute identity across all 100 iterations
      plans.push(
        JSON.stringify(plan, (_, v) => (typeof v === "bigint" ? v.toString() : v))
      );
    }

    // Every plan must be 100% identical
    const firstPlan = plans[0];
    for (const planStr of plans) {
      expect(planStr).toBe(firstPlan);
    }
  });

  it("Test B & C: Stable Plan Hash & Replay Stability", () => {
    // Construct base plan
    const plan = buildPaymentPlan({
      fromAddress: mockFrom,
      outputs,
      availableUtxos: utxos,
      feeRateSompiPerMass: 1n,
      changeAddress: mockFrom
    });

    // Create an artifact-like structure
    const baseArtifact = {
      schema: "hardkas.txPlan" as const,
      hardkasVersion: "0.8.10-alpha",
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: "simnet" as const,
      mode: "simulated" as const,
      createdAt: "2026-05-24T14:24:46.000Z",
      planId: "txplan_stable_test_id",
      from: { address: mockFrom },
      to: { address: mockTo },
      amountSompi: "2600000",
      estimatedFeeSompi: plan.estimatedFeeSompi.toString(),
      estimatedMass: plan.estimatedMass.toString(),
      inputs: plan.inputs.map((i) => ({
        outpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index },
        amountSompi: i.amountSompi.toString()
      })),
      outputs: plan.outputs.map((o) => ({
        address: o.address,
        amountSompi: o.amountSompi.toString()
      })),
      change: plan.change
        ? {
            address: plan.change.address,
            amountSompi: plan.change.amountSompi.toString()
          }
        : undefined
    };

    // Calculate initial hash
    const initialHash = calculateContentHash(baseArtifact);

    // Verify adding dynamic volatile exclusions (rpcHost, latencyMs) does NOT mutate the content hash
    const pollutedArtifact = {
      ...baseArtifact,
      rpcHost: "localhost",
      latencyMs: 15,
      rpcUrl: "http://localhost:16110",
      createdAt: "2026-05-25T12:00:00.000Z" // createdAt is excluded as well
    };

    const pollutedHash = calculateContentHash(pollutedArtifact);
    expect(pollutedHash).toBe(initialHash);
  });

  it("Test D: Hardcoded Cross-Platform Hash Fixture & Fixed Metadata Assertions", () => {
    // Rigidly lock configuration details to prevent false positives when they change.
    // If any of these expectations change in the future, the dev will be forced to update.
    expect(CURRENT_HASH_VERSION).toBe(3);
    expect(ARTIFACT_VERSION).toBe("1.0.0-alpha");

    // Assert exact semantic exclusions to ensure no critical/economic field is accidentally excluded
    const expectedExclusions = [
      "contentHash",
      "artifactId",
      "planId",
      "lineage",
      "createdAt",
      "rpcUrl",
      "rpcHost",
      "latencyMs",
      "indexedAt",
      "file_path",
      "file_mtime_ms",
      "hardkasVersion",
      "hashVersion",
      "parentArtifactId",
      "signedId",
      "deployedAt",
      "tracePath",
      "receiptPath",
      "events",
      "status",
      "sourceSignedId",
      "submittedAt",
      "confirmedAt",
      "dagContext"
    ];
    for (const key of expectedExclusions) {
      expect(SEMANTIC_EXCLUSIONS.has(key)).toBe(true);
    }
    // Double check no economic or value fields are excluded by accident
    const economicFields = [
      "amountSompi",
      "estimatedFeeSompi",
      "estimatedMass",
      "inputs",
      "outputs",
      "change"
    ];
    for (const field of economicFields) {
      expect(SEMANTIC_EXCLUSIONS.has(field)).toBe(false);
    }

    // Hardcode an exact fixed test artifact
    const fixedArtifact = {
      schema: "hardkas.txPlan" as const,
      hardkasVersion: "0.8.10-alpha",
      version: "1.0.0-alpha",
      hashVersion: 3,
      networkId: "simnet" as const,
      mode: "simulated" as const,
      createdAt: "2026-05-24T14:24:46.000Z",
      planId: "txplan_canonical_fixture_id",
      from: { address: "kaspa:alice" },
      to: { address: "kaspa:bob" },
      amountSompi: "1000000",
      estimatedFeeSompi: "350",
      estimatedMass: "350",
      inputs: [
        {
          outpoint: {
            transactionId:
              "tx00000000000000000000000000000000000000000000000000000000000000",
            index: 0
          },
          amountSompi: "2000000"
        }
      ],
      outputs: [{ address: "kaspa:bob", amountSompi: "1000000" }],
      change: { address: "kaspa:alice", amountSompi: "999650" }
    };

    const hash = calculateContentHash(fixedArtifact);

    // We will print Node version and other environment details
    console.log(`[Test D Info] Node Version: ${process.version}`);
    console.log(`[Test D Info] OS Platform: ${process.platform}`);
    console.log(`[Test D Info] Canonical Hash version: ${CURRENT_HASH_VERSION}`);
    console.log(`[Test D Info] Calculated Canonical Hash: ${hash}`);

    // Let's assert against the true pre-calculated hash
    const calculatedStringRepresentation = canonicalStringify(
      fixedArtifact,
      CURRENT_HASH_VERSION
    );
    const expectedStringRepresentation =
      '{"amountSompi":"1000000","change":{"address":"kaspa:alice","amountSompi":"999650"},"estimatedFeeSompi":"350","estimatedMass":"350","from":{"address":"kaspa:alice"},"inputs":[{"amountSompi":"2000000","outpoint":{"index":0,"transactionId":"tx00000000000000000000000000000000000000000000000000000000000000"}}],"mode":"simulated","networkId":"simnet","outputs":[{"address":"kaspa:bob","amountSompi":"1000000"}],"schema":"hardkas.txPlan","to":{"address":"kaspa:bob"},"version":"1.0.0-alpha"}';
    expect(calculatedStringRepresentation).toBe(expectedStringRepresentation);

    const trueHash = createHash("sha256")
      .update(expectedStringRepresentation)
      .digest("hex");
    expect(hash).toBe(trueHash);
    expect(hash).toBe("1cd118fdefc3afefdd176f96ef6a6de85d58dabede91bff0189d4dfc6bdb6bf4");
  });

  it("Test E: Equal Amount Tie-Breaking", () => {
    // Available UTXOs have same amount, but different transactionIds and indices
    const equalUtxos: Utxo[] = [
      {
        outpoint: { transactionId: "txB", index: 0 },
        address: mockFrom,
        amountSompi: 1000n,
        scriptPublicKey: "spk"
      },
      {
        outpoint: { transactionId: "txA", index: 1 },
        address: mockFrom,
        amountSompi: 1000n,
        scriptPublicKey: "spk"
      },
      {
        outpoint: { transactionId: "txA", index: 0 },
        address: mockFrom,
        amountSompi: 1000n,
        scriptPublicKey: "spk"
      }
    ];

    const plan = buildPaymentPlan({
      fromAddress: mockFrom,
      outputs: [{ address: mockTo, amountSompi: 1500n }],
      availableUtxos: equalUtxos,
      feeRateSompiPerMass: 1n,
      changeAddress: mockFrom
    });

    // The planner should select:
    // First, txA:0 (sorted by txid ASC, then index ASC)
    // Second, txA:1
    // Third, txB:0
    const input0 = must(plan.inputs[0], "plan.inputs[0]");
    expect(input0.outpoint.transactionId).toBe("txA");
    expect(input0.outpoint.index).toBe(0);

    const input1 = must(plan.inputs[1], "plan.inputs[1]");
    expect(input1.outpoint.transactionId).toBe("txA");
    expect(input1.outpoint.index).toBe(1);

    const input2 = must(plan.inputs[2], "plan.inputs[2]");
    expect(input2.outpoint.transactionId).toBe("txB");
    expect(input2.outpoint.index).toBe(0);
  });

  it("Test F: Output Canonicalization + Change Separate Field", () => {
    // Outputs with same values but different addresses, and different values
    const recipientOutputs = [
      { address: "kaspa:charlie", amountSompi: 2000n },
      { address: "kaspa:alice", amountSompi: 2000n },
      { address: "kaspa:bob", amountSompi: 1000n }
    ];

    // Candidate UTXOs
    const availableUtxos = [createMockUtxo({ address: mockFrom, amountSompi: 10000n })];

    const plan = buildPaymentPlan({
      fromAddress: mockFrom,
      outputs: recipientOutputs,
      availableUtxos,
      feeRateSompiPerMass: 1n,
      changeAddress: mockFrom
    });

    // Recipient outputs sorted by: amountSompi ASC, address ASC
    // Index 0: kaspa:bob (1000n)
    // Index 1: kaspa:alice (2000n)
    // Index 2: kaspa:charlie (2000n)
    const output0 = must(plan.outputs[0], "plan.outputs[0]");
    expect(output0.amountSompi).toBe(1000n);
    expect(output0.address).toBe("kaspa:bob");

    const output1 = must(plan.outputs[1], "plan.outputs[1]");
    expect(output1.amountSompi).toBe(2000n);
    expect(output1.address).toBe("kaspa:alice");

    const output2 = must(plan.outputs[2], "plan.outputs[2]");
    expect(output2.amountSompi).toBe(2000n);
    expect(output2.address).toBe("kaspa:charlie");

    // The plan.change should be defined and separate
    expect(plan.change).toBeDefined();
    expect(plan.change?.address).toBe(mockFrom);
  });
});
