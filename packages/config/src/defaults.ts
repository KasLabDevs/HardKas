import type { HardkasConfig } from "./types";

export const DEFAULT_HARDKAS_CONFIG: HardkasConfig = {
  defaultNetwork: "simnet",
  networks: {
    simnet: {
      kind: "simulated"
    },
    devnet: {
      kind: "kaspa-node",
      network: "devnet",
      rpcUrl: "ws://127.0.0.1:18310"
    },
    testnet10: {
      kind: "kaspa-rpc",
      network: "testnet-10",
      rpcUrl: "ws://127.0.0.1:18210"
    }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" },
    carol: { kind: "simulated", address: "kaspa:sim_carol" }
  }
};
