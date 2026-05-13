# RFC: HardKas Test Runner v1

## 1. Problem Statement
The `hardkas test` command is currently a **mock with hardcoded output**. This represents a critical risk for the ecosystem as it:
- Generates a **false sense of confidence** in the developer.
- Breaks the **auditing posture** of the framework by not executing real tests.
- Blocks real adoption of the framework for CI/CD pipelines.
- Lacks integration between test logic and the HardKas runtime (Localnet, Artifacts).

**Critical Mandate:** `hardkas test` must never print passing tests unless real test files have been executed.

## 2. Goals
- Execute real test files (TypeScript).
- Integrate **Vitest** as the internal test execution engine.
- Automatically inject the **HardKas Runtime** (`hardkas`, `accounts`, `localnet`, `artifacts`) into the test context.
- Expose a **Fixture system** to load predefined states.
- Support **Snapshots** (Vitest textual and HardKas artifact snapshots).
- Support **Localnet Hooks** (automatic start/reset/stop between tests).
- Produce correct **Exit Codes** (0 for success, 1 for test failures, 2 for environment errors).
- Maintain **JSON** output compatibility for integration with external tools.
- Be fully usable in **CI** environments.

## 3. Non-Goals
- Completely replace Vitest or create a custom assertion framework.
- Execute tests on production networks (Mainnet) by default.
- Resolve real key custody within the test environment.
- Implement advanced Fuzzing techniques in this v1 version.
- Implement a web dashboard or graphical results interface.

## 4. Current State Audit

| Area | Current behavior | Risk |
| :--- | :--- | :--- |
| **Execution** | Hardcoded `console.log` | **CRITICAL**: False confidence, user code is not tested. |
| **Discovery** | Mock glob pattern `test/**/*.test.ts` | Does not search for real files or validate their existence. |
| **Runtime** | `Hardkas.open(".")` initialized but not used | Inefficiency, state is not injected anywhere. |
| **Output** | Fixed `✅ 2 passing` | Does not reflect project reality. |
| **Cleanliness** | `localnet.start()` called but no cleanup hooks | State may remain dirty between runs. |

## 5. Runner Choice

| Option | Pros | Cons | Recommendation |
| :--- | :--- | :--- | :--- |
| **Vitest** | Native TS, Fast, Snapshots, Programmatic API | Dependency surface | **Recommended** |
| **Mocha** | Mature, Simple | Manual TS and Snapshots setup | Not preferred |
| **Custom** | Total control | Very costly and bug-prone | No |

**Recommendation:** Use **Vitest** as the internal engine. Its programmatic API allows wrapping it in the `hardkas test` command while maintaining a consistent UX with the rest of the CLI.

## 6. CLI Interface v1

| Flag | Purpose | Default |
| :--- | :--- | :--- |
| `[files...]` | Specific files or globs to execute | `test/**/*.test.ts` |
| `--network` | Target network (simnet, localnet) | `simnet` |
| `--watch` | Watch mode | `false` |
| `--json` | Structured output for machines | `false` |
| `--reporter` | Report format (default, dot, junit) | `default` |
| `--update-snapshots`| Update artifact snapshots | `false` |

## 7. Test File Discovery
1. If files are passed as arguments, use those.
2. Otherwise, search by default:
   - `test/**/*.test.ts`
   - `tests/**/*.test.ts`
   - `**/*.hardkas.test.ts`
3. Always ignore: `node_modules`, `dist`, `.hardkas`, `.git`.
4. Native TypeScript support via Vitest.

## 8. Runtime Injection
The `@hardkas/testing` package is proposed to expose the runtime.

```typescript
import { describe, it, expect } from "vitest";
import { hardkasTest } from "@hardkas/testing";

describe("Payment Workflow", () => {
  // Injects runtime and configures automatic localnet hooks
  const h = hardkasTest({
    mode: "simulated"
  });

  it("should create and sign a payment plan", async () => {
    // h.tx, h.accounts, h.artifacts are available
    const plan = await h.tx.plan({
      from: "alice",
      to: "bob",
      amountKas: "10"
    });

    expect(plan.schema).toBe("hardkas.txPlan");
    expect(plan.amountSompi).toBe("1000000000");
  });
});
```

## 9. Fixture System
The fixture system will allow loading DAG states and account balances deterministically.

```typescript
it("should use a named fixture", async () => {
  await h.fixtures.load("standard-faucet");
  const balance = await h.accounts.balance("alice");
  expect(balance).toBeGreaterThan(0n);
});
```

Proposed API:
- `h.fixtures.load(name)`: Loads a dataset.
- `h.fixtures.reset()`: Clears localnet state.
- `h.fixtures.snapshot(name)` / `h.fixtures.restore(name)`: Fast in-memory save points.

## 10. Snapshot Support
Three types of snapshots are differentiated:
1. **Vitest Textual Snapshots**: `expect(data).toMatchSnapshot()`.
2. **HardKas Artifact Snapshots**: `expectArtifact(plan).toMatchArtifactSnapshot()`.
3. **Localnet State Snapshots**: `await h.localnet.saveSnapshot("checkpoint-1")`.

**Security Rule:** Artifact snapshots must normalize temporal metadata (timestamps) and **NEVER** save secrets (private keys).

## 11. Localnet Hooks
The runner will automatically manage the lifecycle:
- `beforeAll`: Start Localnet if not active.
- `beforeEach`: Reset state to base fixture or empty state.
- `afterAll`: Clean up processes (Docker node) if started by the test.
- `timeout`: RPC timeout management (default 10s).

## 12. Security / Safety
- **Mainnet Block**: The `hardkas test` command must fail if the detected network is `mainnet` unless an explicit escape flag is used (not recommended).
- **Secret Redaction**: If a test accidentally prints an object containing a private key, the logger must apply a mask.
- **Isolation**: Artifacts generated during tests are saved in `.hardkas/test/artifacts` to avoid cluttering the productive workspace.

## 13. Artifact Integration
- Tests generate real artifact lineage.
- The test runtime `QueryEngine` must be isolated.
- Ability to automatically verify artifact validity against its Zod schema.

## 14. JSON Output / CI
The JSON reporter must be compatible with CI reporting tools:
```json
{
  "ok": true,
  "stats": { "suites": 1, "tests": 5, "passed": 5, "failed": 0 },
  "durationMs": 1250
}
```

## 15. Implementation Plan

### Phase 1 — Remove Mock
- Remove hardcoded `console.log` in `packages/cli/src/commands/test.ts`.
- Implement dynamic file discovery.
- If no files are found, exit with a warning (0) or error (1) based on configuration.
- Wire Vitest programmatic API.

### Phase 2 — Testing Package
- Create `@hardkas/testing`.
- Define `hardkasTest` helper.
- Implement Vitest context injection.

### Phase 3 — Localnet Fixtures
- Integrate `localnet.reset()` and `localnet.restore()` into Vitest hooks.
- Implement JSON fixture loading system.

### Phase 4 — Hardening
- Implement structured JSON reporter.
- Full documentation and real examples.

## 16. Files To Change

| File | Change |
| :--- | :--- |
| `packages/cli/src/commands/test.ts` | Replace mock with real runner call. |
| `packages/cli/src/runners/test-runner.ts` | [NEW] Implement Vitest wrapper. |
| `packages/testing/*` | [NEW] Utility package for the end user. |
| `examples/basic/test/payment.test.ts` | [NEW] Functional real test example. |

## 17. Acceptance Criteria
1. `hardkas test` fails if there are no files or if tests fail.
2. A functional SDK instance is injected into the test.
3. Localnet state is reset between tests.
4. Artifact snapshots do not include private keys.
5. Exit code is `0` only if all real tests passed.

## 18. Recommended Tests
- `no-files-found`: Verify behavior without `.test.ts` files.
- `passing-test`: Successful execution of a real test.
- `failing-test`: CLI returns exit code 1 when a test fails.
- `network-injection`: Verify that the `--network` flag changes the test runtime.
- `mainnet-rejection`: Security block when attempting to test against mainnet.

## 19. Risks

| Risk | Mitigation |
| :--- | :--- |
| **Unstable Vitest API** | Pin exact version in `package.json`. |
| **Startup slowness** | Use lazy import for the Vitest engine. |
| **Dirty Localnet state** | `resetEachTest: true` by default in the testing runtime. |
| **Secret leakage** | Apply redaction masks in test reporters. |

## 20. Final Recommendation
This change is a **CRITICAL (P0)** priority. Maintaining a mock in the test command undermines framework integrity. The first goal must be **honesty**: we prefer `hardkas test` to say "0 files found" than to lie with "2 passing".

## 21. Checklist
- [x] Execute real files.
- [x] Integrate Vitest.
- [x] Runtime injection.
- [x] Fixture system.
- [x] Snapshot support.
- [x] Localnet hooks.
- [x] No modifications to productive logic outside of testing.
