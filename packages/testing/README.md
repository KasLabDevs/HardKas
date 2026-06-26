# @hardkas/testing

The `@hardkas/testing` package provides the `scenario` engine to write fully deterministic, artifact-driven tests and scenarios for HardKAS projects using [Vitest](https://vitest.dev/).

## Your first scenario

Writing a scenario is just like writing a normal Vitest test, but using the `scenario` bridge. The engine automatically provisions a fully configured `HardkasEnvironment` (`hk`) for your test, complete with funded simulated accounts and artifact tracing.

```typescript
import { scenario, expect } from "@hardkas/testing/scenarios";

scenario("my first payment", async ({ hk }) => {
  // 1. Resolve accounts
  const alice = await hk.accounts.resolve("alice");
  const bob = await hk.accounts.resolve("bob");
  
  const beforeBob = await hk.accounts.balance(bob.address);

  // 2. Transact
  const plan = await hk.tx.plan({
    from: alice.address,
    to: bob.address,
    amount: "10" // 10 KAS
  });

  const signed = await hk.tx.sign(plan);
  const result = await hk.tx.send(signed);

  // 3. Verify
  const afterBob = await hk.accounts.balance(bob.address);
  expect(afterBob.sompi - beforeBob.sompi).toBe(10n * 100000000n);
});
```

## Scenario Result Artifacts

Whenever a scenario finishes running, it produces a `ScenarioResultV1` artifact, saving the outcome inside your project's `.hardkas/artifacts/` folder:

```json
{
  "schema": "hardkas.scenarioResult.v1",
  "scenarioName": "my first payment",
  "status": "passed",
  "artifactsGenerated": [
    "simulated-plan-4d7c...",
    "signedTx-89799cd..."
  ]
}
```

If your test fails, the engine safely extracts the assertion error and logs a `failed` scenario result, capturing the state of the failure natively without dumping raw stack traces into the JSON.

## Parallel Execution
Localnet state currently defaults to a shared state across scenarios. To avoid state corruption, make sure you configure your `vitest.config.ts` to execute sequentially:

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    pool: "forks"
  }
});
```
