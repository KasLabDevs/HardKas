# Testing and CI

HardKAS makes CI tests deeply deterministic using the Replay Engine.

## The Replay Engine

When a test runs, HardKAS records the exact lineage of artifacts generated. The Replay Engine can then mathematically verify that the causal graph is unbroken and that the semantic bundle perfectly matches expectations.

### Verification in CI

Your CI pipeline should always include a strict verification step:

```bash
pnpm hardkas verify --strict
```

This ensures that:
- No artifacts were modified by hand.
- The `events.jsonl` ledger is uncorrupted.
- The state files (like `localnet.json`) have not leaked into the artifact index.

### Testing Workflows Programmatically

You can invoke the replay engine inside Vitest or Jest:

```typescript
import { Hardkas } from '@hardkas/sdk';
import { expect, test } from 'vitest';

test('Workflow maintains semantic truth', async () => {
  const sdk = await Hardkas.create({ mode: 'simulated' });
  
  // Run your workflow...
  
  const isValid = await sdk.replay.verify();
  expect(isValid).toBe(true);
});
});
```

## Coverage Terminologies

When evaluating HardKAS command line and SDK test coverage, we use specific terminology to avoid false confidence:

- **Classified Coverage**: Represents the total surface area of commands discovered dynamically. Reaching 100% means every possible command/subcommand/flag has been identified and mapped to a security classification, even if skipped.
- **Execution Coverage**: Represents the percentage of commands that were executed end-to-end and successfully returned a valid exit code (or expected safe failure). Help-only outputs do *not* count towards execution coverage.
- **Scenario Coverage**: Represents mutations at the flag/argument level for a specific executed command (e.g., executing the same command 5 times with different flags).
