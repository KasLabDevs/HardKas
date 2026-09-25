---
title: Chaos engine
---

`hardkas chaos` formalizes destructive behavior into deterministic, reproducible campaigns. It uses a seeded LCG PRNG (MINSTD) so every campaign is reproducible from its seed.

#### LockHell

Injects stale locks, zero-byte TOCTOU locks, concurrent rebuilds.

#### RotBot

Corrupts JSONL streams with truncated JSON, garbage bytes, schema violations.

#### DriftHunter

Deletes SQLite, mutates projection inputs, verifies rebuild from artifacts.

#### HumanChaos

Runs invalid commands and operator mistakes to detect raw stack trace leaks.

**chaos campaigns Copy**

```typescript
hardkas chaos --runs 300 --seed 1337 --profile smoke
hardkas chaos --runs 3000 --seed 1337 --profile targeted
hardkas chaos --actor LockHell --runs 500 --seed 404
hardkas chaos replay --run-seed 42
```

Exit code

Meaning

0

No findings.

1

Recoverable findings.

2

Invariant violation (includes raw stack trace leaks).

3

Unsafe configuration refused.

4

Internal chaos engine failure.

:::note
**Isolation.** Chaos runs in an isolated workspace by default and refuses unsafe current-directory destruction without explicit opt-in.
:::
