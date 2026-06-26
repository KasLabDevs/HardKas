import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "01-local-payment-flow",
  network: {
    default: "simulated",
    allowPublic: false
  },
  networks: {
    simulated: {
      kind: "simulated",
      description: "Local app gauntlet simulation"
    }
  },
  evidence: {
    artifacts: true,
    deterministic: true,
    lineage: true
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" },
    carol: { kind: "simulated", address: "kaspa:sim_carol" }
  }
});
