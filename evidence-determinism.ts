import { createTxPlanArtifact } from "./packages/artifacts/src/tx-plan.ts";
import { canonicalStringify, calculateContentHash } from "./packages/artifacts/src/canonical.ts";

const options = {
  networkId: "simnet",
  mode: "simulated",
  from: { address: "alice", input: "alice" },
  to: { address: "bob", input: "bob" },
  amountSompi: 100000000n,
  plan: {
    estimatedFeeSompi: 1000n,
    estimatedMass: 200n,
    inputs: [],
    outputs: []
  }
};

(async () => {
  const art1 = createTxPlanArtifact(options as any);
  // Wait a bit to ensure potential Date.now() would change (though it's ignored)
  await new Promise(r => setTimeout(r, 100));
  const art2 = createTxPlanArtifact(options as any);

  console.log("Artifact 1 CreatedAt:", art1.createdAt);
  console.log("Artifact 2 CreatedAt:", art2.createdAt);
  console.log("Artifact 1 ContentHash:", art1.contentHash);
  console.log("Artifact 2 ContentHash:", art2.contentHash);
  console.log("Hashes match:", art1.contentHash === art2.contentHash);
  console.log("Plan IDs match:", art1.planId === art2.planId);
})();
