import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "05-artifact-replay-lab",
  network: {
    default: "simulated",
    allowPublic: false
  },
  networks: {
    simulated: {
      kind: "simulated"
    }
  },
  evidence: {
    artifacts: true,
    deterministic: true,
    lineage: true
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" }
  }
});
