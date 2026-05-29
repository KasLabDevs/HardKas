# HardKAS DX Friction & Bug Report

## Local / Deterministic Mode

### 1. `hardkas accounts balance` assumes RPC

- **Issue**: Running `hardkas accounts balance <account>` completely ignores the `simulated` environment and attempts to connect to a real Kaspa node at `ws://127.0.0.1`.
- **Repro**: `hardkas accounts balance alice --network simulated`
- **Error**: `Cannot connect to Kaspa RPC at ws://undefined.`
- **Gap**: There is no way from the CLI to check the deterministic balance of an account in the local `query-store` without writing an SDK script. This defeats the purpose of the simulated mode for quick CLI checks.

### 2. `hardkas tx send` defaults to RPC networks

- **Issue**: `hardkas tx send` throws a warning: `WARNING: The 'simnet' network alias is deprecated...` even when the `hardkas.config.ts` explicitly sets `defaultNetwork: "simulated"`. It seems the CLI commands don't perfectly respect the local config's default network and fallback to `simnet` (an RPC-based network) arbitrarily.
