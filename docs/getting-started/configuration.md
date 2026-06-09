# Configuration

HardKAS discovers its workspace through `hardkas.config.ts`.

`hardkas init .` creates a local-first config similar to:

```typescript
import { defineHardkasConfig } from "@hardkas/sdk";

export default defineHardkasConfig({
  defaultNetwork: "simulated",

  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation, no Docker, no RPC, no node"
    },
    simnet: {
      kind: "kaspa-node",
      network: "simnet",
      rpcUrl: "ws://127.0.0.1:18210",
      description: "Local Docker kaspad on simnet"
    }
  },

  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" }
  }
});
```

## Environments

- `simulated`: offline deterministic state in `.hardkas/localnet.json`.
- `simnet`: local Kaspa node/RPC integration for advanced testing.
- `testnet-*`: external network testing.
- `mainnet`: intentionally outside the alpha happy path.

Prefer `simulated` until the artifact flow is correct and repeatable.
