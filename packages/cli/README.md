# `@hardkas/cli`

The `cli` package is the primary entrypoint for developers. It is built strictly on `Commander.js` and acts as a thin routing layer over `@hardkas/sdk`, ensuring all interactions remain stateless and deterministic.

## 1. The Chaos Engine (Resilience Testing)

The most advanced feature within the CLI is the Chaos Engine, which deterministically injects faults into the local workspace to prove the resilience of the Core and Query Store layers.

### Flow: Seeded Campaigns
```bash
hardkas chaos --runs 500 --seed 1337
```
1. The CLI initializes a Linear Congruential Generator (LCG) PRNG using the provided seed.
2. It randomly selects "Actors" (e.g., `LockHell`, `RotBot`) to execute destructive routines against `.hardkas/`.
3. After every run, it executes `hardkas replay verify path` to assert that the workspace can still self-heal and recover.

### Variant: Specific Actors
- **LockHell:** Rapidly creates `0-byte` lock files and abandons them, testing the `STALE_LOCK_RECOVERY` logic.
- **RotBot:** Truncates JSON blobs at the end of `events.jsonl`, asserting that the `AppendCoordinator` tail-repair algorithm works correctly.
- **DriftHunter:** Force-deletes the SQLite query store mid-transaction, testing the `Full Rebuild` flow.

## 2. Secret Redaction Pipeline

To protect developer keys during CLI stack traces or `--json` outputs, the CLI wraps standard output channels.

### Flow: Recursive Masking
1. When an error is thrown to the top-level `Commander.js` catch block, the CLI scans the `Error` object and its properties.
2. Any string matching the regex pattern for a Kaspa private key, mnemonic phrase, or defined password environment variable is replaced with `[REDACTED]`.
3. This ensures that copying and pasting a stack trace into an issue tracker or AI prompt will not leak local devnet keys.
