# HardKAS Pre-0.7.12 Scope Analysis

**Date:** 2026-06-02  
**Context:** Following the 0.7.13-alpha release, two major probes were executed: Command Coverage Phase 2b (testing all remaining CLI commands with correct args) and a React Frontend Readiness Probe.

---

## 1. Command Coverage Summary (Phase 2 + 2b)

Of the ~100 discovered CLI commands, we have now successfully executed and classified the safe ones.

### Bugs Discovered (4 Confirmed)

| ID | Component | Description | Severity |
|----|-----------|-------------|----------|
| 1 | `tx.send` | **Strict validation fails** in simulated mode: `invalid simulated input` when re-entering simulate with a signed artifact. | **P1** |
| 2 | `workflow inspect/replay` | Alias `latest` does not resolve, throws "Artifact latest not found". | P2 |
| 3 | `artifact explain` | Throws `SECURITY WARNINGS DETECTED` even for valid signed transaction artifacts. | P2 |
| 4 | `localnet snapshot verify` | Broken logic or pathing. Throws "Snapshot not found" immediately after successful `snapshot create`. | P3 |

### Execution Classification

| Category | Count | Detail |
|----------|-------|--------|
| ✅ **SUCCESS** | **45+** | Commands verified to run without crashing (Phase 1 + 2 + 2b) |
| 🐛 **FAIL_BUG** | 4 | Actual product bugs |
| ⚠️ **FAIL_EXPECTED** | 2 | e.g. `test` fails if no tests exist; `verify-semantics` fails if no torture matrix run exists |
| ⏳ **SKIP_LONG_RUNNING** | 4 | `sandbox`, `dev server`, `dev dashboard`, `telemetry tail` (run forever by design) |
| 🌐 **SKIP_EXTERNAL_NETWORK**| 4 | `node status`, `node logs`, `rpc health`, `rpc info` (require external node/docker) |
| 🔐 **SKIP_NEEDS_SECRET** | 1 | `accounts real generate` (prompts/outputs secrets) |

**Conclusion on CLI:** The CLI is highly functional. Most of the 0.7.11 surface area works precisely as intended. The coverage gaps are either intentional (long-running daemons) or external dependencies (Docker/Kaspa node).

---

## 2. React / Frontend Readiness

A series of 5 Vite/React probes were built against `@hardkas/sdk@0.7.13-alpha` to map the browser boundary.

### Probe Results

| Probe | Goal | Result | Classification |
|-------|------|--------|----------------|
| `wallet-readonly` | Import `Hardkas` | ❌ Fails | **NODE_ONLY_BOUNDARY** |
| `artifact-viewer` | Call `artifacts.list()` | ❌ Fails | **NODE_ONLY_BOUNDARY** |
| `transaction-form`| Call `tx.plan()` | ❌ Fails | **NODE_ONLY_BOUNDARY** |
| `backend-proxy` | Express backend + React | ✅ Works | **BACKEND_PROXY_WORKS** |

### Why the SDK fails in the Browser
Vite/Webpack immediately throw externalization errors because `@hardkas/sdk` heavily imports Node.js built-ins:
- `fs` and `path` (Workspace management, config parsing, file persistence)
- `crypto` (Hashing, signing)
- `better-sqlite3` native bindings (Query indexing)

### Recommended Frontend Architecture

Browser apps **cannot** import `@hardkas/sdk` directly. The correct architecture requires a proxy layer:

```mermaid
graph TD;
  Browser[Browser React App] -->|HTTP| Hooks[@hardkas/react Hooks]
  Hooks --> Client[@hardkas/client HTTP]
  Client -->|REST| Backend[Node.js Backend/Proxy]
  Backend --> SDK[@hardkas/sdk]
  SDK --> Workspace[.hardkas/ Workspace]
```

---

## 3. Recommended Scope

Do not fix anything yet. Here are the proposed scopes for the next sprints:

### Option A: Hardening Sprint (0.7.12)
Focus entirely on fixing the 4 discovered bugs and solidifying the existing SDK/CLI footprint.
- Fix P1 `tx.send` strict validation bug.
- Fix P2 `latest` alias in workflows.
- Fix P2 `artifact explain` security warning.
- Fix P3 `localnet snapshot` bug.
- Add regression tests for these commands.

### Option B: The Frontend Sprint (0.8.0)
Accept the current CLI state as "good enough" for alpha, and shift focus entirely to the React developer experience.
- Build `@hardkas/client` (Browser-safe HTTP client with matching SDK signatures).
- Build `@hardkas/react` (Hooks: `useHardkas`, `useArtifacts`, `useTxPlan`).
- Add a lightweight API server to `@hardkas/cli dev server` to power the React hooks.

### Recommendation
**Split the work.** 
Do a fast **0.7.12 patch** to fix the P1 `tx.send` bug (as it breaks core transaction flows). Then, freeze 0.7.x and begin the **0.8.0 Feature Sprint** focusing on React readiness.
