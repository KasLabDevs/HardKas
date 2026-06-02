# HardKAS 0.7.12-alpha Technical Security & Architectural Audit
## Post SDK Completeness Sprint Assessment

> [!IMPORTANT]
> **Status:** **REJECTED / NOT READY FOR PRODUCTION RELEASE**
> HardKAS has made impressive progress, stabilizing its CLI gauntlet and expanding its SDK capabilities. However, this audit has uncovered **7 Critical Architecture and Security Bugs (P0 & P1)** that prevent it from advancing beyond `0.7.12-alpha`. Most notably, cross-platform hashing non-determinism, severe workspace path traversal, and file-naming inconsistencies completely break the Replay and Localnet fork architectures.

---

## 1. Executive Summary

This audit performs a full-surface analysis of HardKAS `0.7.12-alpha` across determinism, security, consistency, package integrity, and DX. While the core invariants of canonical serialization (such as property sorting and metadata exclusion) are robustly implemented in `packages/artifacts`, the integration layers in the SDK and CLI introduce severe vulnerabilities and architectural defects.

### High-Level Status Table

| Audit Category | Status | Key Finding |
| :--- | :--- | :--- |
| **1. Deterministic Artifact Audit** | <span style="color:red">**CRITICAL**</span> | `localeCompare` in signature sorting breaks cross-platform determinism. |
| **2. Artifact Lattice & Replay Audit** | <span style="color:red">**CRITICAL**</span> | Replay SDK path resolution is broken; searches in non-existent nested directories. |
| **3. Multisig Security Audit** | <span style="color:green">**PASS**</span> | Authorization and double-signing preventions are cryptographically sound. |
| **4. SDK Facade Security Audit** | <span style="color:red">**CRITICAL**</span> | Severe path traversal / file leakage vulnerability in `artifacts.read()`. |
| **5. AutoBootstrap Audit** | <span style="color:red">**CRITICAL**</span> | Inconsistent naming (`localnet.json` vs `localnet-state.json`) disables Localnet Forks. |
| **6. Query Store Audit** | <span style="color:orange">**WARNING**</span> | Non-excluded `localnet-state.json` gets indexed as a corrupted artifact. |
| **7. SDK vs CLI Equivalence Audit** | <span style="color:red">**CRITICAL**</span> | SDK `tx.plan()` hardcodes `mode: "simulated"`, breaking parity on real networks. |
| **8. Dependency / Packaging Audit** | <span style="color:red">**CRITICAL**</span> | `@hardkas/query-store` incorrectly classified as devDependency; SDK fails to compile. |
| **9. Error Handling / DX Audit** | <span style="color:orange">**WARNING**</span> | Silent failures in AutoBootstrap swallow critical permission/write errors. |

---

## 2. Critical Bugs (Architectural & Security)

### [BUG-01] [CRITICAL] Multisig Cross-Platform Non-Determinism (P0)
* **Component:** `packages/sdk/src/tx.ts`
* **Description:** Signature sorting in `tx.ts` (lines 219 and 305) utilizes `a.signer.localeCompare(b.signer)`. The `localeCompare` function is inherently host-dependent, varying across operating systems (Windows vs Linux) and Node.js ICU configurations. Because `canonicalStringify` does not sort arrays, divergent array sorting orders will yield entirely different `contentHash` values for the exact same transaction, breaking platform-independent determinism.
* **Reproduction:**
  ```typescript
  // Run on Windows with Spanish locale, then on Linux with US locale
  const signedTx = await sdk.tx.appendSignature(partialTx, bobAccount);
  // Content hashes will differ, violating the Bob->Alice / Alice->Bob ordering equivalence.
  ```
* **Suggested Fix:**
  ```diff
  - const newSignatures = [...sigs, signatureEntry].sort((a, b) =>
  -   a.signer.localeCompare(b.signer)
  - );
  + const newSignatures = [...sigs, signatureEntry].sort((a, b) =>
  +   deterministicCompare(a.signer, b.signer)
  + );
  ```

### [BUG-02] [CRITICAL] Path Traversal & Workspace Leakage (P0)
* **Component:** `packages/sdk/src/artifacts-manager.ts`
* **Description:** The `artifacts.read()` method uses a raw `fs.existsSync(filePath)` check. If a consumer provides an absolute or highly-escaped relative path (e.g. `../../etc/passwd` or ssh keys), the manager will happily read the file directly if it exists on the host filesystem. In Agent Mode, this allows malicious inputs or tool usage to leak sensitive host files outside the designated workspace.
* **Reproduction:**
  ```typescript
  // An agent is tricked into reading SSH private keys
  const data = await sdk.artifacts.read('C:/Users/jrodr/.ssh/id_rsa');
  // Returns raw content or attempts to parse, escaping the sandbox root
  ```
* **Suggested Fix:** Ensure the resolved absolute path starts with `workspace.root`:
  ```typescript
  const absoluteTarget = path.resolve(this.workspace.root, filePath);
  if (!absoluteTarget.startsWith(this.workspace.root)) {
    throw new HardkasError("PATH_TRAVERSAL", "Access denied: target path escapes workspace boundary.");
  }
  ```

### [BUG-03] [CRITICAL] Replay SDK Path Resolution Mismatch (P0)
* **Component:** `packages/sdk/src/replay.ts`
* **Description:** The Replay `verify()` method resolves the target directory for artifact-scanning as `.hardkas/artifacts`. It then incorrectly appends `.hardkas/receipts`, `.hardkas/traces`, and `.hardkas/deployments` to it, creating paths like `.hardkas/artifacts/.hardkas/receipts`. These directories do not exist, causing the scanner to completely skip receipts and traces during automated replay audits.
* **Reproduction:**
  ```typescript
  const result = await sdk.replay.verify();
  console.log(result.artifactsScanned); // Returns 0 scanned artifacts due to wrong paths
  ```
* **Suggested Fix:** Resolve directories relative to the workspace root or standard `.hardkas` directory directly:
  ```typescript
  const canonicalDirs = [
    path.join(this.sdk.workspace.hardkasDir, "receipts"),
    path.join(this.sdk.workspace.hardkasDir, "traces"),
    path.join(this.sdk.workspace.hardkasDir, "deployments")
  ];
  ```

### [BUG-04] [CRITICAL] Localnet State Nismatch (`localnet-state.json` vs `localnet.json`) (P1)
* **Component:** `packages/cli` & `packages/localnet` & `packages/query-store`
* **Description:** The CLI command `hardkas localnet fork` saves the state to `.hardkas/localnet-state.json`. However, the simulator store (`packages/localnet/src/store.ts`) and SDK workspace resolve it to `.hardkas/localnet.json`. This causes the simulator to completely ignore the forked state and initialize a new empty simulated network. 
* **Impact:** 
  1. Localnet forks are ignored by the simulator.
  2. The query store indexer does not exclude `localnet-state.json`, causing the indexer to attempt to parse it as an artifact, fail, and record it as a **CORRUPTED artifact** in the doctor report.
* **Reproduction:**
  ```bash
  hardkas localnet fork --network testnet-10
  hardkas query sync
  # Warns: "CORRUPTED artifact found at .hardkas/localnet-state.json"
  ```
* **Suggested Fix:** Align the state file to `.hardkas/localnet.json` across all CLI, SDK, and localnet modules, and ensure it is properly excluded in `indexer.ts` walk routines.

### [BUG-05] [CRITICAL] SDK Facade `tx.plan()` Hardcoded Mode (P1)
* **Component:** `packages/sdk/src/tx.ts`
* **Description:** In the SDK facade, `tx.plan()` hardcodes `mode: "simulated"` inside `createTxPlanArtifact`. While the CLI dynamically resolves the mode (`real` vs `simulated`) based on whether a real Kaspa RPC or node target is used, the SDK will mark real network plans as `simulated`, resulting in address format mismatches and lineage audit failures.
* **Reproduction:**
  ```typescript
  const plan = await sdk.tx.plan({ from: "alice_real", to: "bob_real", amount: "10" });
  console.log(plan.mode); // "simulated" (expected "real")
  ```
* **Suggested Fix:** Resolve the network target configuration and set `mode: mode === "simulated" ? "simulated" : "real"` dynamically.

### [BUG-06] [CRITICAL] `@hardkas/query-store` Incorrect Dependency Categorization (P1)
* **Component:** `packages/sdk/package.json`
* **Description:** The package `@hardkas/query-store` is classified under `devDependencies` in the SDK package configuration. However, it is imported dynamically at runtime in `packages/sdk/src/query.ts` when calling `sdk.query.sync()`. In a clean installation (production build), `devDependencies` are not installed, causing the sync API to throw a `Cannot find module` error.
* **Suggested Fix:** Move `@hardkas/query-store` to the production `dependencies` array.

### [BUG-07] [CRITICAL] TypeScript Compilation Blocker in SDK (P2)
* **Component:** `packages/sdk/src/query.ts` (line 82)
* **Description:** The `events` method in the query class attempts to return `result.items` (typed as `readonly unknown[]`) as a mutable `any[]` array. This raises compilation error `TS4104: The type 'readonly unknown[]' is 'readonly' and cannot be assigned to the mutable type 'any[]'`, blocking any automated release build pipeline.
* **Suggested Fix:** Change the return typing of `events` to `Promise<readonly any[]>` or cast the return as `result.items as any[]`.

---

## 3. Warnings

### [WARN-01] [WARNING] Silent Initialization Failure in autoBootstrap (P2)
* **Component:** `packages/sdk/src/index.ts`
* **Description:** The localnet initialization under `autoBootstrap` is wrapped in a silent try/catch block:
  ```typescript
  try {
    const { loadOrCreateLocalnetState } = await import("@hardkas/localnet");
    await loadOrCreateLocalnetState({ cwd });
  } catch {
    // ignore error if it fails to init localnet
  }
  ```
  If this fails due to read-only folder permissions, disk capacity, or missing dependencies, it fails silently, leading to very poor DX and mysterious downstream errors when planning transactions.
* **Suggested Fix:** Log a descriptive warning using `options.logger.warn` or throw the error if in strict mode.

---

## 4. Passed Invariants (Proven Stable)

Through deep static analysis and adversarial testing, the following core platform invariants are verified as **PASSING**:

### Hashing & Hashing Stability Invariants
* **Canonical Serialization:** Property ordering is recursively sorted and verified. Keys are deterministic. BigInt representation (`n:123`) is correctly resolved.
* **Metadata Exclusion:** Dynamic metadata (`createdAt`, `rpcUrl`, `latencyMs`, `lineage`) is successfully excluded from hash calculations. Modifying these fields does not alter the `contentHash`.
* **Float/String Stability:** Zod schema validation correctly casts amounts to strings (`amountSompi`), completely preventing Float rounding instabilities.
* **Linux/Windows Parity:** UTF-8 NFC normalization and CRLF-to-LF newlines are correctly handled. Strict path keys (`file_path`, `receiptPath`) successfully normalize backslashes to forward slashes.

### Multisig Security
* **Double Signing Prevention:** Alice is strictly prohibited from signing a transaction twice. Attempting to append an existing signer's signature throws an explicit error.
* **Unauthorized Signer Prevention:** Appending a signature from a signer not listed in `requiredSigners` is strictly blocked and rejected with an error.

---

## 5. Artifact Lattice Transition

The cryptographic transition sequence has been analyzed and validated as mathematically sound. Below is the transition DAG with parent linkage validation rules:

```mermaid
graph TD
    classDef valid fill:#d4edda,stroke:#28a745,stroke-width:2px,color:#155724;
    classDef invalid fill:#f8d7da,stroke:#dc3545,stroke-width:2px,color:#721c24;

    Snapshot["hardkas.snapshot<br>(Base State / UTXOs)"] ::: valid
    TxPlan["hardkas.txPlan<br>(Deterministic Inputs/Outputs)"] ::: valid
    SignedTx["hardkas.signedTx<br>(Signature Verification)"] ::: valid
    TxReceipt["hardkas.txReceipt<br>(Consensus Inclusion)"] ::: valid

    Snapshot -->|Allowed Transition| TxPlan
    TxPlan -->|Allowed Transition| SignedTx
    SignedTx -->|Allowed Transition| TxReceipt

    style Snapshot stroke-dasharray: 5 5;
```

### Lattice Continuity Audits:
* **Orphan Detection:** The lineage tracing successfully isolates chains missing a parent artifact.
* **Divergence Check:** `replay.verify()` successfully detects when a local state re-execution differs from the artifact `postStateHash`.

---

## 6. SDK vs CLI Equivalence Matrix

Below is a detailed parity comparison of the CLI command set against the SDK facade APIs:

| CLI Command | SDK API | Equivalent? | Difference / Architectural Gap |
| :--- | :--- | :---: | :--- |
| `hardkas tx plan` | `sdk.tx.plan()` | **NO** | 1. SDK hardcodes `mode: "simulated"` regardless of the network target config.<br>2. CLI automatically saves the plan to `.hardkas/artifacts/`, whereas the SDK only returns the in-memory object and requires manual `sdk.artifacts.write()` invocation. |
| `hardkas tx sign` | `sdk.tx.sign()` | **YES** | Syntactically equivalent, but both currently suffer from the **P0 Cross-Platform Hashing Non-Determinism** bug (`localeCompare`). |
| `hardkas tx send` | `sdk.tx.send()` | **YES** | Core broadcast logic is equivalent. |
| `hardkas localnet fork` | `sdk.localnet` | **NO** | The CLI forks the network state into `localnet-state.json`, but the simulator and bootstrap systems expect `localnet.json`, rendering forks completely inoperable in the SDK. |
| `hardkas status` | `sdk.tx.status()` | **YES** | Core transaction state checking is equivalent. |
| `hardkas query sync` | `sdk.query.sync()` | **YES** | Syntactically equivalent, but the CLI sync is safe from missing dependencies, while the SDK sync crashes in production due to the devDependency packaging bug. |

---

## 7. Action Plan & Suggested Fixes

To prepare HardKAS for `0.7.12-alpha` release readiness, the following fixes should be implemented:

1. **Deterministic Multisig:** Replace `localeCompare` with `deterministicCompare` in `packages/sdk/src/tx.ts` for all signature array sorting.
2. **Secure Sandbox:** Implement strict parent path checks in `HardkasArtifactsManager.read` to block path traversal attempts.
3. **Replay Path Fix:** Correct `canonicalDirs` mapping inside `HardkasReplay.verify` to read from the workspace `.hardkas/` directory instead of nested under `.hardkas/artifacts`.
4. **Localnet Consolidation:** Change `localnet-state.json` to `localnet.json` in the CLI fork runner, and add `localnet-state.json` to the indexer walk exclusions.
5. **Mode Resolution:** Update `HardkasTx.plan` to dynamically set mode as `real` or `simulated` by resolving the network target.
6. **Move dependencies:** Move `@hardkas/query-store` to the production `dependencies` field in the SDK package.json.
7. **Type Casting:** Cast `result.items` to `any[]` or update return types in `sdk/src/query.ts` to solve the TS compilation blocker.
