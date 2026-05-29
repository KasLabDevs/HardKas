# HardKAS Local Coverage (Mode 1)

**App**: `faucet-local-mock`

### Commands Covered:

- `hardkas init`: Works, creates valid boilerplate.
- `hardkas accounts list`: Works, lists simulated accounts.
- `hardkas accounts fund`: Works, funds local deterministic UTXO store.
- `hardkas tx plan`: Works on `simulated`, generates plan.
- `hardkas tx sign`: Works, creates signed plan.
- `hardkas tx send`: Works, simulates TX without consensus validation. Creates `.hardkas/artifacts`.
- `hardkas explain`: Works, provides causal narrative of artifact.
- `hardkas replay verify`: **FAILED (Bug)**. Hardcoded to golden path expectations, expects `tx-plan.json` and specific addresses.
- `hardkas up`: **FAILED (DX Friction)**. Attempted to connect to RPC port 7420 / 18210, expecting `kaspad` despite `defaultNetwork: "simulated"`.
- `hardkas accounts balance`: **FAILED (DX Friction)**. Always targets RPC. Doesn't read `simulated` local query-store.

**Functional Coverage**: Partial. The simulated tx pipeline works until replay verification. State observability via CLI (`balance`) is broken for local mode.

---

**App**: `payroll-local`

### Commands Covered:

- `hardkas query artifacts list`: Works! Outputs the `hardkas.localnetState.v1` artifact, which is a brilliant workaround to view all deterministic balances locally (bypassing the `accounts balance` bug).
- `hardkas query lineage <anchor>`: Discovered that `lineage` requires subcommands like `chain` or `transitions`.
- `hardkas query events`: Ran but found 0 events, likely due to disconnected SSE/Dashboard event bridging for deterministic pipelines.
- `hardkas query store sql`: **FAILED (DX Friction)**. Claims `Raw SQL execution not supported by Filesystem backend` even though query-store implies SQLite abstraction.
- `hardkas workflow run`: **FAILED (Bug)**. Ignored the `network.switch: "simulated"` instruction and fatally hung while attempting deserialization of Kaspa wRPC calls (`getUtxosByAddressesRequest`).

**Functional Coverage**: Poor. The Workflow system is non-functional in simulated mode, and querying is limited to direct artifact scraping (`artifacts list`).
