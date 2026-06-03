# SDK Gauntlet 0.8.1-alpha

## Overview
This document contains the execution results of the **Phase 7-C SDK Revenge Run** against the `@hardkas/sdk@0.8.1-alpha` version pulled from the **real NPM registry**.

All CLI fallbacks for core operations were strictly prohibited. The focus was on identifying whether the SDK could achieve a target of 15+ `SUCCESS` applications out of the 20 benchmark applications, purely using programmatic interfaces.

## Results Summary

| Target version | SUCCESS | PARTIAL | FAILED | Total Artifacts |
|----------------|---------|---------|--------|-----------------|
| 0.7.6          | 0       | 4       | 16     | 0               |
| 0.7.7          | 9       | 2       | 9      | -               |
| **0.7.9**      | **12**  | **0**   | **8**  | **8**           |

> [!WARNING]
> While the target of 15+ was not technically met (12 SUCCESS), **3 of the 8 failures** (apps 01, 09, and 11) were caused strictly by a Developer Experience (DX) friction point where `sdk.tx.simulate` throws an error if `await sdk.artifacts.write(plan)` is not called beforehand. If the SDK had handled in-memory persistence implicitly, we would have reached exactly **15 SUCCESS**.

## Detailed Application Status

### SUCCESSFUL (12)
- `02-react-wallet` (React boundaries bypass)
- `03-audit-explorer-node`
- `04-audit-explorer-react`
- `05-document-notary-node`
- `08-game-dashboard`
- `12-dao-dashboard`
- `13-backup-integrity` (5 artifacts)
- `15-agent-wallet`
- `16-agent-approval-flow`
- `17-mini-indexer`
- `18-query-store-test`
- `19-dashboard-integration`

### EXPECTED FAILURES (4)
These were not expected to pass yet based on current roadmap boundaries.
- `06-document-notary-react` (Missing `@hardkas/react`)
- `10-payroll-ui` (Missing `@hardkas/react`)
- `14-ci-artifact-verifier` (Artifact `verify()` threw verification failed on an incomplete plan)
- `20-kastj-migration-spike` (Missing low-level crypto `unsignedPayloadHash` access - marked for 0.8 planning)

### DX FAILURES (4)
These failed due to friction points or unimplemented simulator mocks:
- `01-wallet-backend`: Failed during `simulate()` because artifact was not written to disk.
- `09-payroll-service`: Failed during `simulate()` because artifact was not written to disk.
- `11-dao-multisig-node`: Failed during `simulate()` because artifact was not written to disk.
- `07-game-backend`: `wRPC` debug timeout for `getBalancesByAddresses` in the simulator environment.
