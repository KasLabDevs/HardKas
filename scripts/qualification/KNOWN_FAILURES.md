# Known Harness Failures and Limitations

The following items are known failures or limitations in the qualification harness (not necessarily bugs in HardKAS itself).

## QF-001
- **Component**: qualification harness
- **Status**: FIXED_NOT_REQUALIFIED
- **Classification**: HARNESS_INCOMPLETE
- **Gate**: B2 (Funded Account and Mature UTXO)
- **Impact**: blocks `fundedAccount` + `matureUtxo` capabilities
- **HardKAS regression proven**: NO

### Description
**Expected closure**: B2 harness path successfully exercised.

## QF-002
- **Component**: `@hardkas/sdk`
- **Status**: CLOSED
- **Classification**: HARNESS_API_MISUSE
- **Gate**: B1 (CLI Localnet Bootstrap)
- **Impact**: Blocks `rpcActuallyReachable` capability.
- **HardKAS regression proven**: NO

### Description
**Root cause**: Instantiating the SDK with `new Hardkas({ network: "simnet", rpc: { endpoints: ["127.0.0.1:18210"] } })` throws `TypeError: Cannot read properties of undefined (reading 'network')`. The public API contract requires using the async factory `Hardkas.create(...)`.
**Required fix**: The qualification harness was updated to use the supported `await Hardkas.create(...)` async factory instead of `new Hardkas(...)`.

## QF-003
- **Component**: `@hardkas/cli` + `@hardkas/accounts`
- **Status**: FIXED_NOT_REQUALIFIED
- **Classification**: EXECUTION_CONTEXT_RESOLUTION_BUG
- **Severity**: P1 release blocker
- **Gate**: B2 (Funded Account and Mature UTXO)
- **Impact**: Blocks `fundedAccount` and `matureUtxo` capabilities, blocking transactional gates (D-G).
- **HardKAS regression proven**: YES

### Description
**Observed**:
`explicit --profile toccata-v2` → `target = localnet/simnet` → account resolver ignores explicit target → falls back to global default `simulated` → alice materialized as `synthetic` → execution guard correctly rejects it with `EXECUTION_MODE_MISMATCH`.

**Root cause**:
Account resolution is occurring without the resolved execution target. The fallback configuration is taking precedence over the explicit CLI target.

**Fix**:
Explicit ExecutionTarget propagated into account resolution.

**Closure criterion**:
fresh external consumer → localnet start → fund alice --profile toccata-v2 → real kaspa/simnet account → mature spendable UTXO
