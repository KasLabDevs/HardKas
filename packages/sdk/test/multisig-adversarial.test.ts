import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import { verifyArtifactIntegrity } from "@hardkas/artifacts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Multisig Adversarial Suite", () => {
  let tmpDir: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-multisig-adv-"));
    fs.writeFileSync(
      path.join(tmpDir, "hardkas.config.ts"),
      "export default { defaultNetwork: 'simulated', networks: { simulated: { kind: 'simulated' } } };"
    );
    sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "developer"
    });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // Helper to shuffle an array
  function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  it("Case 1 & 4: Should support threshold 2 of 3 and reject append on signed", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");
    const carol = await sdk.accounts.resolve("carol");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });

    // Threshold = 2, Required = Alice, Bob, Carol
    const options = {
      threshold: 2,
      requiredSigners: [alice.address, bob.address, carol.address]
    };

    // Alice signs first
    const sig1 = await sdk.tx.sign(plan, "alice", options);
    expect(sig1.status).toBe("partially_signed");
    expect(sig1.multisig?.signatures.length).toBe(1);

    // Bob signs and completes threshold
    const sig2 = await sdk.tx.sign(sig1, "bob", { append: true });
    expect(sig2.status).toBe("signed");
    expect(sig2.multisig?.signatures.length).toBe(2);
    expect(sig2.signedTransaction).toBeDefined();

    // Carol tries to append to already signed transaction (Case 4)
    await expect(sdk.tx.sign(sig2, "carol", { append: true })).rejects.toThrow(
      /already completed/
    );
  });

  it("Case 2: Should reject duplicate signature", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });

    // Alice tries to sign again
    await expect(sdk.tx.sign(sig1, "alice", { append: true })).rejects.toThrow(
      /already signed/
    );
  });

  it("Case 3: Should reject unauthorized signer", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });

    // Carol is not authorized
    await expect(sdk.tx.sign(sig1, "carol", { append: true })).rejects.toThrow(
      /not an authorized signer/
    );
  });

  it("Case 5: Should pass replay verify on signed multisig", async () => {
    // Replay verify reads plan and receipt from the artifact directory.
    // Let's create a simulated transaction workflow and verify it.
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    // Reset localnet state with faucet
    const { resetLocalnetState } = await import("@hardkas/localnet");
    await resetLocalnetState({ initialBalanceSompi: 100_000_000_000n });

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const sig2 = await sdk.tx.sign(sig1, "bob", { append: true });

    // Simulate the transaction to generate a receipt offline
    const simResult = await sdk.tx.simulate(sig2);
    expect(simResult.receipt).toBeDefined();

    // Write named files so replay verification can resolve them
    fs.writeFileSync(path.join(tmpDir, "tx-plan.json"), JSON.stringify(plan, null, 2));
    fs.writeFileSync(
      path.join(tmpDir, "tx-receipt.json"),
      JSON.stringify(simResult.receipt, null, 2)
    );

    // Verify replay consistency of the signed transaction sequence
    const verifyResult = await sdk.experimental.replay.verify({ path: "tx-plan.json" });
    if (!verifyResult.passed) {
      console.log("verifyResult:", JSON.stringify(verifyResult, null, 2));
    }
    expect(verifyResult.passed).toBe(true);
    expect(verifyResult.determinism).toBe("verified");
  });

  it("Case 6: Random signature order order-invariance check (100 iterations)", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");
    const carol = await sdk.accounts.resolve("carol");

    const signers = [
      { name: "alice", addr: alice.address },
      { name: "bob", addr: bob.address },
      { name: "carol", addr: carol.address }
    ];

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const options = {
      threshold: 3,
      requiredSigners: [alice.address, bob.address, carol.address]
    };

    let canonicalHash: string | undefined;

    for (let i = 0; i < 100; i++) {
      const shuffled = shuffle(signers);

      // Step 1: First signer signs plan
      let state = await sdk.tx.sign(plan, shuffled[0].name, options);

      // Step 2: Second signer appends
      state = await sdk.tx.sign(state, shuffled[1].name, { append: true });

      // Step 3: Third signer appends
      state = await sdk.tx.sign(state, shuffled[2].name, { append: true });

      expect(state.status).toBe("signed");
      expect(state.multisig?.signatures.length).toBe(3);
      expect(state.unsignedPayloadHash).toBe(plan.contentHash);
    }
  }, 30000);

  it("Case 7: Manual corruption of signatures[] array", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const sig2 = await sdk.tx.sign(sig1, "bob", { append: true });

    // Verify original has correct integrity
    const initialCheck = await verifyArtifactIntegrity(sig2);
    expect(initialCheck.ok).toBe(true);

    // Corrupt signature hex string
    const corruptedArtifact = JSON.parse(JSON.stringify(sig2));
    corruptedArtifact.multisig.signatures[0].signature = "deadbeef";

    const checkCorrupted = await verifyArtifactIntegrity(corruptedArtifact);
    expect(checkCorrupted.ok).toBe(false);
    expect(checkCorrupted.errors[0]).toContain("Hash mismatch");
  });

  it("Case 8: Manual corruption of threshold value", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const sig2 = await sdk.tx.sign(sig1, "bob", { append: true });

    // Corrupt threshold value from 2 to 1
    const corruptedArtifact = JSON.parse(JSON.stringify(sig2));
    corruptedArtifact.multisig.threshold = 1;

    const checkCorrupted = await verifyArtifactIntegrity(corruptedArtifact);
    expect(checkCorrupted.ok).toBe(false);
    expect(checkCorrupted.errors[0]).toContain("Hash mismatch");
  });

  it("Case 9: Manual corruption of requiredSigners list", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");
    const carol = await sdk.accounts.resolve("carol");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const sig2 = await sdk.tx.sign(sig1, "bob", { append: true });

    // Corrupt requiredSigners to inject Carol instead of Bob
    const corruptedArtifact = JSON.parse(JSON.stringify(sig2));
    corruptedArtifact.multisig.requiredSigners = [alice.address, carol.address];

    const checkCorrupted = await verifyArtifactIntegrity(corruptedArtifact);
    expect(checkCorrupted.ok).toBe(false);
    expect(checkCorrupted.errors[0]).toContain("Hash mismatch");
  });

  it("Case 10: Lineage walk from partial and signed", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    await sdk.artifacts.write(plan);
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const sig2 = await sdk.tx.sign(sig1, "bob", { append: true });

    // Manually initialize and sync the SQLite store.db using indexer
    const { HardkasStore, HardkasIndexer } = await import("@hardkas/query-store");
    const dbPath = path.join(tmpDir, ".hardkas", "store.db");
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const store = new HardkasStore({ dbPath });
    store.connect({ autoMigrate: true });
    const indexer = new HardkasIndexer(store.getDatabase(), { cwd: tmpDir });
    await indexer.rebuild();
    store.disconnect();

    const { QueryEngine, createQueryRequest } = await import("@hardkas/query");
    const engine = await QueryEngine.create({ artifactDir: tmpDir });

    // Retrieve plan artifact ID
    const planId = plan.planId;
    const sig1Id = sig1.signedId;
    const sig2Id = sig2.signedId;

    // Walk lineage from partially signed
    const request1 = createQueryRequest({
      domain: "lineage",
      op: "chain",
      params: { anchor: sig1Id, direction: "ancestors" }
    });
    const result1 = await engine.execute(request1);
    const partialLineage = result1.items[0];
    expect(partialLineage).toBeDefined();
    expect(partialLineage.nodes.length).toBe(2);
    expect(partialLineage.nodes.map((n: any) => n.schema)).toContain("hardkas.txPlan");
    expect(partialLineage.nodes.map((n: any) => n.schema)).toContain("hardkas.signedTx");

    // Walk lineage from signed
    const request2 = createQueryRequest({
      domain: "lineage",
      op: "chain",
      params: { anchor: sig2Id, direction: "ancestors" }
    });
    const result2 = await engine.execute(request2);
    const signedLineage = result2.items[0];

    // Disconnect SQLite backend to prevent EPERM locks on file delete
    if (engine.backend && (engine.backend as any).store) {
      (engine.backend as any).store.disconnect();
    }

    expect(signedLineage).toBeDefined();
    expect(signedLineage.nodes.length).toBe(3);
  });
});
