# DX Comparison: Faucet (Local vs RPC)

## Mode 1: Local / Deterministic (`faucet-local`)

**Pros:**
- `hardkas init` provides a clean folder structure.
- `hardkas accounts fund` allows instantly creating money out of thin air to test logic.
- `hardkas tx plan`, `sign`, and `send` work seamlessly in isolation.
- `hardkas explain` works beautifully on the generated artifacts.

**Friction / Gaps:**
- `hardkas accounts balance` **always** tries to connect to an RPC node, breaking the deterministic CLI observability loop. You literally cannot check a local account's balance via CLI without writing a script.
- `hardkas replay verify` is rigidly hardcoded to a specific golden path (`simnet`, specific test addresses, hardcoded filenames). It doesn't dynamically adapt to your generated `plan.json`.
- `hardkas tx send` throws a deprecation warning about `simnet` and dynamically resolves it to `simulated` under the hood. 

---

## Mode 2: Real Node/RPC (`faucet-rpc`)

**Pros:**
- `hardkas node start` pulls the Docker image and seamlessly boots a `simnet` node.
- `hardkas rpc health` works exactly as expected, providing detailed connection diagnostics.
- Testing RPC absence against `mainnet` cleanly fails with `Unknown connection error`.

**Friction / Gaps:**
- Setting `defaultNetwork: "simnet"` in `hardkas.config.ts` doesn't strictly enforce RPC. `hardkas tx plan` still falls back to `simulated` mode silently.
- `hardkas accounts real generate` fails, complaining about a missing "Kaspa WASM SDK adapter" even after `@kaspa/core-lib` is installed. It says to use `import` manually. 
- It is nearly impossible to complete an end-to-end `tx plan -> sign -> send` via CLI on RPC because `hardkas tx plan` intercepts the call and runs it locally, and generating/importing real wallets is blocked by missing adapter deps.

## Verdict
The local deterministic Mode is fundamentally more solid for tx lifecycle testing, but suffers from severe observability bugs (can't check balance, replay verify is broken). The Node/RPC mode is plagued by CLI commands forcefully intercepting RPC requests and reverting to local simulation, plus broken keystore generation dependencies. 
