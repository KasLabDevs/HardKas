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
    sender: { kind: "simulated", address: "kaspa:sim_sender" },
    receiver1: { kind: "simulated", address: "kaspa:sim_receiver1" },
    receiver2: { kind: "simulated", address: "kaspa:sim_receiver2" },
    receiver3: { kind: "simulated", address: "kaspa:sim_receiver3" }
  }
});
