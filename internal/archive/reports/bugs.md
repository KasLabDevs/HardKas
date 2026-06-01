# HardKAS Bugs Report

## 1. `hardkas replay verify` is hardcoded to a golden path

- **Bug**: `hardkas replay verify <dir>` looks for hardcoded filenames (`tx-plan.json` and `tx-receipt.json`) in the current directory instead of analyzing the `.hardkas/artifacts` registry dynamically.
- **Bug**: The verification logic compares the generated artifact against hardcoded expectations (`receipt.networkId: expected "simnet", got "simulated"` and `receipt.from.address: expected "kaspa:sim_alice", got "kaspa:sim_sim_alice"`), rather than computing semantic equivalence. It essentially acts as a broken snapshot test instead of a generalized verifier.
- **Impact**: Developers cannot use `hardkas replay verify` to assert the integrity of their own workflows.

## 2. Default Network Leaking

- **Bug**: The CLI aliases `simnet` as a fallback even when `defaultNetwork: "simulated"` is set in `hardkas.config.ts`.
- **Impact**: `hardkas tx plan` warns about `simnet` deprecation and tries to resolve it, masking the actual configured network mode.

## 3. Workflow Engine ignores Simulated Mode

- **Bug**: Running `hardkas workflow run <file>` with a `network.switch` to `"simulated"` completely ignores the simulation mode. The `tx.plan` steps inside the workflow attempt to execute `getUtxosByAddressesRequest` via wRPC.
- **Bug**: The wRPC calls fail with `request deserialization error` and timeout, freezing the workflow runner indefinitely in Agent Mode.
- **Impact**: Declarative workflows are completely unusable for local deterministic orchestration.

## 4. `query store sql` requires manual backend setup

- **Bug**: Running `hardkas query store sql "<query>"` fails immediately with `Raw SQL execution not supported by Filesystem backend. Use SQLite backend.` even when the dashboard/query-store is active.
- **Impact**: Developers cannot do ad-hoc SQL queries on the local deterministic state without manually writing config overrides.
