# Local-First Architecture

HardKAS is built fundamentally as a **local-first** developer runtime.

It is designed to give you a robust, reproducible, and private environment to model Kaspa transactions, debug workflows, and build dApps offline or against local nodes before considering testnet or mainnet deployments.

## Core Philosophy
- **Local Over Remote:** Localnet simulations and isolated workspaces take precedence over immediate mainnet connection.
- **No Production Bridge:** We do not provide a production L1-L2 bridge. Any bridge tooling (e.g., Igra) is strictly experimental and read-only.
- **No Trustless Exits:** HardKAS does not facilitate trustless exits or ZK proofs to Kaspa L1.
- **No L1 EVM:** Kaspa L1 does not execute EVM code. Any EVM tooling is isolated to L2 experiments.
- **Observability First:** The local runtime prioritizes extreme observability (time-travel, deterministic replays) over raw TPS or mainnet scale.
