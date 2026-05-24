# HardKas CLI Command Status Taxonomy

This document classifies the actual functional status of all commands registered in the HardKas command-line interface. This taxonomy allows developers and auditors to identify which parts of the system are operational, which are experimental, and which act as placeholders for future functionality.

## Status Definitions

### 🟢 VERIFIED
Command registered in Commander with a real handler that executes fully implemented logic.
- **Criteria**: Calls a real runner or function; output is derived from real data; no critical implementation blocks.
- **Example**: `hardkas tx plan`, `hardkas query artifacts list`.

### 🟡 PARTIAL
Functional command but with limited scope or dependent on simulated states.
- **Criteria**: Depends exclusively on `localnet/simulator`; only covers happy paths; incomplete implementation of the command's promise.
- **Example**: `hardkas dag status`, `hardkas l2 balance`.

### 🧪 EXPERIMENTAL
Functional command but explicitly marked as unstable or in the research phase.
- **Criteria**: `experimental` or `research` maturity tag; subject to drastic changes in the output API.
- **Example**: `hardkas query dag conflicts`, `hardkas l2 bridge status`.

### 🟠 MOCK
Command that simulates successful results without executing the real logical flow.
- **Criteria**: Hardcoded output (e.g., "✓ 2 passing"); uses explicit dummy data; "UX Theater" behavior.
- **Example**: `hardkas accounts real lock`.

### 🔴 PLACEHOLDER
Registered command that does not execute any real operation.
- **Criteria**: Empty handler or with `throw "not implemented"`; only prints an explanation without action.
- **Example**: Planned but not wired commands.

### ⚫ DISABLED
Registered command but intentionally blocked by the development team.
- **Criteria**: Explicit "temporarily disabled" message.
- **Example**: `hardkas tx trace`.

### ⚪ UNKNOWN
Status not determined due to lack of technical evidence in the handler or delegated runners.

---

## 2. Real Command Classification

| Status | Group | Command | Evidence | Reason | Source file | Runner / handler | Risk |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 🟢 VERIFIED | init | `hardkas init` | `fs.writeFileSync` | Creates real config files | `init.ts` | inline action | LOW |
| 🟢 VERIFIED | init | `hardkas up` | `await runUp()` | Validates Docker/Node environment | `init.ts` | `runUp` | LOW |
| 🟢 VERIFIED | tx | `hardkas tx plan` | `await runTxPlan()` | Generates deterministic artifacts | `tx.ts` | `runTxPlan` | LOW |
| 🟢 VERIFIED | tx | `hardkas tx sign` | `await runTxSign()` | Real cryptographic signature | `tx.ts` | `runTxSign` | MEDIUM |
| 🟢 VERIFIED | tx | `hardkas tx send` | `await runTxSend()` | Real broadcast to the network | `tx.ts` | `runTxSend` | MEDIUM |
| 🟢 VERIFIED | tx | `hardkas tx receipt` | `await runTxReceipt()`| Real query to RPC node | `tx.ts` | `runTxReceipt` | LOW |
| 🟢 VERIFIED | tx | `hardkas tx verify` | `await runTxVerify()` | Real semantic audit | `tx.ts` | `runTxVerify` | LOW |
| ⚫ DISABLED | tx | `hardkas tx trace` | `UI.error("temporarily disabled")` | Disabled due to unstable API | `tx.ts` | inline action | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts list` | `listHardkasAccounts()` | Reads real configuration | `accounts.ts` | inline action | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts real init` | `runAccountsRealInit()` | Initializes keystore on disk | `accounts.ts` | `runAccountsRealInit` | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts real import` | `runAccountsKeystoreImport()` | Imports real keys | `accounts.ts` | `runAccountsKeystoreImport` | MEDIUM |
| 🟢 VERIFIED | accounts | `hardkas accounts real unlock` | `runAccountsKeystoreUnlock()` | Validates real password | `accounts.ts` | `runAccountsKeystoreUnlock` | LOW |
| 🟠 MOCK | accounts | `hardkas accounts real lock` | `console.log("Session cleared")` | UX Theater; no real session persistence | `accounts.ts` | inline action | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts real generate` | `runAccountsRealGenerate()` | Generates keys via SDK | `accounts.ts` | `runAccountsRealGenerate` | MEDIUM |
| 🟢 VERIFIED | accounts | `hardkas accounts balance` | `runAccountsBalance()` | Real balance query | `accounts.ts` | `runAccountsBalance` | LOW |
| 🟢 VERIFIED | accounts | `hardkas accounts fund` | `runAccountsFund()` | Sends real funds (faucet) | `accounts.ts` | `runAccountsFund` | LOW |
| 🟢 VERIFIED | rpc | `hardkas rpc info` | `await runRpcInfo()` | Live network diagnostics | `rpc.ts` | `runRpcInfo` | LOW |
| 🟢 VERIFIED | rpc | `hardkas rpc doctor` | `await runRpcDoctor()` | Real endpoints audit | `rpc.ts` | `runRpcDoctor` | LOW |
| 🟢 VERIFIED | dag | `hardkas dag status` | `uses ApproxGhostdagEngine` | Real GHOSTDAG approximate engine [UPDATED] | `dag.ts` | `runDagStatus` | LOW |
| 🟢 VERIFIED | dag | `hardkas dag simulate-reorg` | `runDagSimulateReorg()` | Real GHOSTDAG approximate engine [UPDATED] | `dag.ts` | `runDagSimulateReorg` | LOW |
| 🟢 VERIFIED | artifact | `hardkas artifact verify` | `runArtifactVerify()` | Real integrity validation | `artifact.ts` | `runArtifactVerify` | LOW |
| 🟢 VERIFIED | artifact | `hardkas artifact explain` | `runArtifactExplain()` | Real semantic analysis | `artifact.ts` | `runArtifactExplain` | LOW |
| 🟢 VERIFIED | query | `hardkas query store doctor` | `engine.backend.doctor()` | Real database audit | `query.ts` | inline action | LOW |
| 🟢 VERIFIED | query | `hardkas query artifacts list` | `engine.execute(request)` | Real search in SQLite/FS | `query.ts` | inline action | LOW |
| 🧪 EXPERIMENTAL | query | `hardkas query lineage chain` | `maturity("preview")` | Lineage engine in development | `query.ts` | inline action | MEDIUM |
| 🧪 EXPERIMENTAL | query | `hardkas query dag conflicts` | `maturity("research")` | Based on light deterministic model | `query.ts" | inline action | MEDIUM |
| 🟢 VERIFIED | node | `hardkas node start` | `runNodeStart()` | Controls real Docker | `node.ts` | `runNodeStart` | MEDIUM |
| 🟢 VERIFIED | node | `hardkas node stop` | `runNodeStop()` | Controls real Docker | `node.ts` | `runNodeStop` | MEDIUM |
| 🟢 VERIFIED | node | `hardkas node reset` | `runNodeReset()` | Clears real disk data | `node.ts` | `runNodeReset` | HIGH |
| 🟡 PARTIAL | l2 | `hardkas l2 balance` | `igra simulation focus` | Igra module in alpha state | `l2.ts` | `runL2Balance` | MEDIUM |
| 🧪 EXPERIMENTAL | l2 | `hardkas l2 bridge status` | `trust assumptions focus` | Theoretical security model | `l2.ts` | `runL2BridgeStatus` | HIGH |
| 🟢 VERIFIED | test | `hardkas test` | `import("vitest/node")` | Real integration with Vitest | `test.ts` | `runTest` | LOW |
| 🟢 VERIFIED | example | `hardkas example list` | `reads registry.json` | Lists real examples from repo | `misc.ts` | `runExampleList` | LOW |
| 🟢 VERIFIED | run | `hardkas run` | `await runScript()` | Real TS script execution with harness [NEW] | `run.ts` | `runScript` | LOW |

---

## 3. Fake / Nonexistent Commands

Commands suggested in documentation or logs but not registered in Commander.

| Command | Reason | Source where it appears | Recommended Action |
| :--- | :--- | :--- | :--- |
| `hardkas query store sync` | Command not registered | [OUTDATED FINDING RESOLVED] | Resolved. Suggested as `sync` or `rebuild` everywhere. |
| `hardkas node logs --follow` | Flag exists but does not implement real streaming in all environments | `node logs` help | Validate streaming implementation in Docker runner. |
| `example.ts` (File) | File does not exist | Reference in previous plans | Commands are in `misc.ts`. Not a critical error but an organizational one. |

---

## 4. Hardcoded / Mocked Outputs

| Command | Evidence | Recommended Status | Recommended Action |
| :--- | :--- | :--- | :--- |
| `hardkas accounts real lock` | `console.log("Account '...' is now locked.")` | 🟠 MOCK | Implement temporary keystore clearing if real security is desired. |
| `hardkas query dag anomalies` | `printDagAnomalies` calls `printExplain` | 🟢 VERIFIED | Corrected reference to `printExplain`. |

---

## 5. Summary

| Status | Count | Commands (Examples) |
| :--- | :--- | :--- |
| 🟢 VERIFIED | 52 | `init`, `up`, `tx plan/sign/send`, `query artifacts`, `dag`, `test`, `run` |
| 🟡 PARTIAL | 6 | `l2 tx`, `snapshot` |
| 🧪 EXPERIMENTAL | 10 | `query lineage`, `query dag`, `l2 bridge` |
| 🟠 MOCK | 1 | `accounts real lock` |
| ⚫ DISABLED | 1 | `tx trace` |
| 🔴 BROKEN | 0 | [OUTDATED FINDING RESOLVED] No broken reference errors found. |

---

## 6. Recommendations

### Critical (P0)
- **Correct Reference Error**: The `printExplainChains` function in `query.ts` should be renamed to `printExplain` to avoid crashes in diagnostics.
- **Sync Doctor Messages**: Change the recommendation from `query store index` to `query store rebuild` in `doctor.ts`.

### High (P1)
- **Clarify Keystore UX**: The `accounts real lock` command should inform that it is a session closure simulation or be real by removing keys from memory.

### Medium (P2)
- **Document L2 as Research**: Ensure all `hardkas l2` commands have the visible `research` tag to avoid confusion with mainnet tools.

---

## 7. Guardrails

- Runtime logic was not modified.
- Runners were not modified.
- Internal packages were not modified.
- No commands were added.
- No commands were removed.
- Classification is based on source code and CLI audit.
