# Your First HardKAS Test

Testing is a first-class citizen in the HardKAS framework. HardKAS brings a scenario-driven testing engine powered by Vitest, tailored for the Kaspa network.

## The `scenario` Wrapper

When you generate a project using `hardkas init`, you'll notice tests use `scenario` instead of `it` or `test`:

```typescript
import { scenario, expect } from "@hardkas/testing";

scenario("payment flow", async ({ hk }) => {
  // Test your smart contracts, transactions, or backend integrations here
});
```

This wrapper ensures that each test runs within its own **isolated workspace**. 
By default, tests have their own deterministic environment, ensuring no collisions happen between parallel tests!

## Running Tests

To execute tests, simply run:

```bash
npx hardkas test
```

HardKAS will automatically:
1. Discover test files in your project (`test/**/*.test.ts`).
2. Run them through the isolated Vitest scenario runner.
3. Automatically track every artifact generated during the tests.

### Helpful Options

- `--keep-runs`: Prevents HardKAS from deleting the isolated workspace folder created for a test. Useful when debugging a failure, allowing you to inspect the temporary `.hardkas/runs/<runId>` directory.
- `--scenario <name>`: Runs only the scenarios matching the provided name.
- `--evidence`: After tests complete, HardKAS will bundle the outcome and the tracked artifacts into an **Evidence Package** (`.hke.json`), ensuring your results are portable and verifiable.

## Evidence Packages

When you pass `--evidence`:

```bash
npx hardkas test --evidence
```

HardKAS scans the scenarios that executed and automatically creates `.hke.json` files for them.
These packages contain:
- The `scenario-result.json`
- Hashes of all artifacts created
- Mode and Network details
- Cryptographic claims (by default, non-claims for local tests)

You can later verify these with:

```bash
npx hardkas evidence verify <scenario_name>.hke.json
```
