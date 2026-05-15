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
    "testnet-10": {
      kind: "kaspa-rpc",
      network: "testnet-10",
      rpcUrl: "wss://tn10.kaspa.stream:443"
    },
    "testnet-11": {
      kind: "kaspa-rpc",
      network: "testnet-11",
      rpcUrl: "wss://tn11.kaspa.stream:443"
    },
    "mainnet": {
      kind: "kaspa-rpc",
      network: "mainnet",
      rpcUrl: "wss://kaspa.stream:443"
    }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" },
    carol: { kind: "simulated", address: "kaspa:sim_carol" }
  }
};
