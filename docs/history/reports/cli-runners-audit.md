# HardKas CLI Runners Audit

## 1. Scope
This document presents an exhaustive audit of all runners implemented in the `@hardkas/cli` package. 53 files under the `packages/cli/src/runners/*` path have been analyzed, evaluating their internal logic, network/IO dependencies, artifact production, and functional stability level.

## 2. Method
1. **Enumeration**: Identification of all `.ts` files in the runners folder.
2. **Code Analysis**: Review of imports to detect internal (`@hardkas/*`) and external package dependencies.
3. **Mapping**: Relationship between runners and the CLI commands that invoke them.
4. **Side Effects**: Identification of disk writes, RPC calls, Docker interaction, and Keystore access.
5. **Classification**: Application of taxonomy (REAL, WRAPPER, PARTIAL, MOCK, EXPERIMENTAL).

## 3. Runner Inventory

| Runner file | Export(s) | Commands using it | Internal packages | Stability | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `up-runner.ts` | `runUp` | `hardkas up` | `@hardkas/config` | `REAL` | Validates environment and RPC connectivity |
| `tx-plan-runner.ts` | `runTxPlan` | `hardkas tx plan` | `tx-builder`, `artifacts` | `REAL` | Orchestrates UTXO retrieval and plan construction |
| `tx-profile-runner.ts` | `runTxProfile` | `hardkas tx profile` | `tx-builder`, `artifacts` | `REAL` | Cost and mass analysis (integrated with snapshots) [UPDATED] |
| `tx-sign-runner.ts` | `runTxSign` | `hardkas tx sign` | `accounts`, `artifacts` | `WRAPPER` | Delegates signing to `@hardkas/accounts` |
| `tx-send-runner.ts` | `runTxSend` | `hardkas tx send` | `kaspa-rpc`, `localnet` | `REAL` | Real broadcast to network/simulator |
| `tx-receipt-runner.ts` | `runTxReceipt` | `hardkas tx receipt` | `kaspa-rpc` | `REAL` | RPC query for TX ID |
| `tx-flow.ts` | `runTxFlow` | `hardkas tx send` (shortcut) | Various | `REAL` | Full Plan-Sign-Send flow orchestrator |
| `accounts-keystore-runners.ts` | `runAccountsKeystore*`| `hardkas accounts real [command]` | `accounts` | `REAL` | Argon2id/AES management |
| `accounts-real-init-runner.ts` | `runAccountsRealInit` | `hardkas accounts real init` | `accounts` | `REAL` | Initializes physical Keystore store |
| `accounts-real-generate-runner.ts`| `runAccountsRealGenerate`| `accounts real generate` | `sdk` | `REAL` | Deterministic Kaspa key generation |
| `l2-tx-runners.ts` | `runL2Tx*` | `hardkas l2 tx [command]` | `l2` | `REAL` | Functional for build/sign/send/status; retains outdated messages |
| `node-start-runner.ts` | `runNodeStart` | `hardkas node start` | `node-runner` | `REAL` | Docker node orchestration |
| `script-runner.ts` | `runScript` | `hardkas run` | `testing` | `REAL` | TS execution with harness injection [NEW] |
| `dag-runners.ts` | `runDag*` | `hardkas dag [command]` | `localnet` | `REAL` | GHOSTDAG approximate engine [UPDATED] |
| `artifact-verify-runner.ts` | `runArtifactVerify` | `hardkas artifact verify` | `artifacts` | `REAL` | Zod schema integrity validation |
| `artifact-explain-runner.ts` | `runArtifactExplain` | `hardkas artifact explain` | `artifacts` | `EXPERIMENTAL` | Semantic artifact analysis |
| `trace-runner.ts` | `runTrace` | `hardkas tx trace` (unused) | `localnet` | `PARTIAL` | **UNUSED**: Associated command disabled |
| `test-runner.ts` | `runTest` | `hardkas test` | `testing` | `REAL` | Vitest programmatic runner [UPDATED] |

## 4. Runner → Command Map

| Command | Runner | Runner file | Role | Produces artifact | Consumes artifact | Network/IO dependency |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `tx plan` | `runTxPlan` | `tx-plan-runner.ts` | Builder | `txPlan` | None | config, localnet/RPC |
| `tx sign` | `runTxSign` | `tx-sign-runner.ts` | Signer | `signedTx` | `txPlan` | keystore |
| `tx send` | `runTxSend` | `tx-send-runner.ts` | Broadcaster | `txReceipt` | `signedTx` | RPC, localnet, FS |
| `l2 tx build` | `runL2TxBuild` | `l2-tx-runners.ts` | Builder | `l2TxPlan` | None | L2 RPC |
| `node start` | `runNodeStart` | `node-start-runner.ts` | Orchestrator | None | None | Docker |
| `doctor` | `runDoctor` | `rpc-doctor-runner.ts` | Diagnostic | None | None | mixed |

## 5. Side Effects Audit

| Runner | Filesystem writes | Network calls | Docker calls | Keystore access | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `runTxSend` | Yes (Receipts/Trace) | Yes (RPC) | No | No | **HIGH** (Broadcast) |
| `runL2TxSend` | Yes (L2 Artifacts) | Yes (L2 RPC) | No | No | **HIGH** (L2 Broadcast) |
| `runTxSign` | No | No | No | Yes | **HIGH** (Signing) |
| `runL2TxSign` | No | No | No | Yes | **HIGH** (L2 Signing) |
| `runAccountsKeystoreImport` | Yes (Keystore JSON) | No | No | Yes (Argon2) | **HIGH** (Key handling) |
| `runAccountsKeystoreChangePassword` | Yes (Keystore JSON) | No | No | Yes | **HIGH** (Key migration) |
| `runNodeReset` | Yes (Data removal) | No | Yes | No | **HIGH** (Data loss) |
| `runSnapshotRestore` | Yes (Localnet state) | No | No | No | **HIGH** (State rewrite) |
| `runAccountsFund` | Yes (Localnet state) | No | No | No | **HIGH** (Faucet/Sim) |

## 6. Artifact Audit

| Runner | Produces | Consumes | Schema / Type | Deterministic | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `runTxPlan` | `txPlan` | None | `hardkas.txPlan` | Yes | UTXO selection orchestration |
| `runTxSign` | `signedTx` | `txPlan` | `hardkas.signedTx` | Yes | Kaspa cryptography |
| `runTxSend` | `txReceipt` | `signedTx` | `hardkas.txReceipt` | No | Contains real txId and timestamp |
| `runL2TxBuild` | `l2TxPlan` | None | `hardkas.l2TxPlan` | Yes | EVM planning |
| `runSnapshotRestore`| None | `snapshot` | `hardkas.snapshot` | Yes | Deterministic state restoration |

## 7. Mock / Partial / Unused Detection

| Runner | Evidence | Classification | Recommended action |
| :--- | :--- | :--- | :--- |
| (Command) | `hardkas test` (inline) | `MOCK` | Implement real runner with Vitest. |
| `dag-runners.ts` | `"Minimal v0.2-alpha implementation"` | `PARTIAL` | Expand simulated GHOSTDAG logic. |
| `accounts.ts` | Lock/Session model | `PARTIAL` | Implement real session management. |
| `l2-tx-runners.ts` | Outdated next step message | **REAL with stale UX hint** | Correct message; send support already exists. [STILL VALID] |
| `trace-runner.ts` | Associated command disabled | **UNUSED** | Integrate with Query Engine or remove. |

## 8. Stability Classification Summary

| Stability | Count | Runners |
| :--- | :--- | :--- |
| `REAL` | 43 | tx (6), l2 (1), accounts (11), rpc (6), node (6), snapshot/replay (4), etc. |
| `WRAPPER` | 3 | tx-sign, node-stop, node-logs |
| `PARTIAL` | 4 | dag (2), trace (1), accounts-lock (1) |
| `EXPERIMENTAL` | 3 | artifact explain/lineage, tx verify |
| `MOCK` | 1 | test (inline command) |

## 9. Architecture Issues Found
- **Responsibility Mixing**: Current runners mix orchestration, output formatting (`formatted` strings), artifact persistence, and occasionally deep business logic.
- **Trapped Business Logic**: `runTxPlan` and `runTxFlow` contain planning logic that should reside exclusively in `@hardkas/tx-builder` or `@hardkas/sdk`.
- **Startup Latency**: Heavy dependencies are statically imported in most runner files.

## 10. Recommendations

### Critical
- **Real Test Runner**: Replace the `hardkas test` mock with a real runner based on Vitest.
- **Confirmation Guards**: Implement security validations in destructive or broadcast runners (`node reset`, `tx send`, `l2 tx send`, `accounts real import`).

### High
- **Orchestration-Only Runners (v1)**: Redesign runners to limit them to orchestrating internal package services:
    - Business logic goes to **Packages**.
    - Artifact persistence goes to an **Artifact Service**.
    - Output formatting goes to an **Output Adapter**.
- **SDK Migration**: Ensure UTXO selection and retrieval logic is 100% accessible from the SDK.

## 11. Proposed Runner Architecture v1

```typescript
// Architecture: Clean Orchestration Runner
export async function runTxPlan(ctx: RunnerContext, input: TxPlanInput): Promise<RunnerResult<TxPlanArtifact>> {
  // 1. Business Logic (delegated to SDK/Package)
  const plan = await ctx.sdk.tx.planPayment(input);
  
  // 2. Artifact Persistence (delegated to Service)
  const artifact = await ctx.services.artifacts.create("txPlan", plan);
  
  // 3. Return Raw Result (formatting is done by CLI adapter)
  return {
    success: true,
    data: artifact
  };
}
```

## 12. Checklist
- [x] Detect mocks
- [x] Classify real/partial stability
- [x] Detect critical side effects
- [x] Propose v1 architecture
- [x] No modifications to runtime logic
- [x] No modifications to runners
- [x] No modifications to internal packages

## Guardrails
- No modifications to runtime logic.
- No modifications to runners.
- No modifications to commands.
- No modifications to internal packages.
- This audit is documentary.
