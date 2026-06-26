import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "07-failure-cases-lab",
  network: {
    default: "simulated",
    allowPublic: false
  },
  networks: {
    simulated: {
      kind: "simulated"
    }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" }
  }
});
