import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  defaultNetwork: "simulated",
  network: { allowPublic: false },
  artifacts: { deterministic: true },
  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation"
    }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" }
  }
});
