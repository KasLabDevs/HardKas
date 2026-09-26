# Test Suites & Commands

HardKAS enforces strict **evidence isolation**. Test suites must explicitly declare their environment dependencies and must never silently change their evidence level if infrastructure is missing.

If a Localnet test requires a running node and the node is missing, the test **MUST FAIL**, not silently skip or fall back to mocks.

## 1. Running Tests

HardKAS uses Vitest. The test architecture is split explicitly by required infrastructure.

### Fast / Default Tests (L0 - L2)
Executes unit tests, component integration, and Simulator workflow tests.
* **Command:** `pnpm test`
* **Infrastructure:** None. Runs entirely in-memory.
* **Target files:** All `*.test.ts` excluding `*.localnet.test.ts` and `*.e2e.test.ts`.

### Localnet Tests (L3)
Executes tests against a real, locally orchestrated Kaspa node.
* **Command:** `pnpm test:localnet`
* **Infrastructure:** Docker (requires `SimnetNodeHarness` to boot `toccata-v2`).
* **Isolation:** The `global-setup.ts` will boot the node, fund Alice, and run a background miner. If Docker is unavailable, the suite throws a FATAL error and fails.

### E2E / Packaging Tests
Executes full CLI end-to-end flows or verifies distributed tarball packaging.
* **Command:** `pnpm test:e2e:docker`
* **Target files:** `*.e2e.test.ts`

### Fuzz / Property Tests
Executes randomized, generative testing for policies, networks, and migrations.
* **Command:** `pnpm test:fuzz`

## 2. Wave Regression Tests

You will notice files named `wave1-def1c-canonical-identity.test.ts` or `wave7-replay-mode-guard.test.ts`.

These are **not** disposable historical artifacts. They encode critical architectural invariants discovered during the Hardening Waves.

* **Wave 1:** Canonical Artifact Identity & Namespace Separation.
* **Wave 3:** Deterministic fund/recipient semantics.
* **Wave 7:** Replay mode guards (fail-closed behavior on real-node receipts).

Do not rename or delete these tests. They defend the structural integrity of HardKAS evidence generation.

## 3. Writing Tests: Decision Tree

When adding a new test, place it in the correct suite to prevent evidence contamination:

1. **Does it interact with a Kaspa node via RPC or evaluate real consensus rules?**
   * Name it `*.localnet.test.ts`. It belongs in L3 evidence.
2. **Does it test a CLI command from outside the process?**
   * Name it `*.e2e.test.ts`.
3. **Does it evaluate the internal planner, test a policy, or mock the network?**
   * Name it `*.test.ts`. It belongs in the default (Simulator/L2) suite.
