import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "02-wallet-dev-flow",
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
    alice: { kind: "simulated", address: "kaspa:sim_alice" }
  }
});
