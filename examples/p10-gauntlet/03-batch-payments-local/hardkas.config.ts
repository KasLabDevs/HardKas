import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  project: "03-batch-payments-local",
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
    bob: { kind: "simulated", address: "kaspa:sim_bob" },
    carol: { kind: "simulated", address: "kaspa:sim_carol" },
    dave: { kind: "simulated", address: "kaspa:sim_dave" },
    eve: { kind: "simulated", address: "kaspa:sim_eve" },
    frank: { kind: "simulated", address: "kaspa:sim_frank" }
  }
});
