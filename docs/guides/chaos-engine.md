---
title: Chaos Engine
description: hardkas chaos runs seeded, reproducible campaigns of destructive actions against a throwaway workspace and reports what failed.
---

# Chaos Engine

`hardkas chaos` (experimental) turns destructive behaviour into reproducible campaigns: each run injects one fault into
a throwaway workspace, runs a HardKAS command there, and records whether the command failed cleanly. A campaign is
deterministic from its seed: run `i` uses the seed `--seed + 13 × i`, which picks the actor and the actor's variant.

```bash
hardkas chaos --runs 300 --seed 1337
hardkas chaos --actor LockHell --runs 500 --seed 404
hardkas chaos replay --run-seed 42
```

## Actors

| Actor | What it does | What counts as a failure |
| :--- | :--- | :--- |
| `LockHell` | writes a zero-byte or a stale `workspace.lock` under `.hardkas/locks/`, then runs `hardkas rebuild --from-artifacts` | an exit code other than 0 or 1, or a raw stack trace |
| `RotBot` | appends a truncated JSON line or garbage bytes to the telemetry stream or the event ledger, then runs `hardkas doctor` | a non-zero exit code or a raw stack trace |
| `DriftHunter` | deletes `.hardkas/store.db`, then runs `hardkas doctor` | a non-zero exit code or a raw stack trace |
| `HumanChaos` | runs a command that does not exist | an exit code other than 0 or 1, or a raw stack trace |

Without `--actor`, each run's actor is drawn from fixed weights (LockHell 40, RotBot 25, DriftHunter 20, HumanChaos 15).
`--profile smoke|targeted|full` has no effect: the three profiles use the same weights. `chaos replay --run-seed <n>`
re-runs one run in a fresh directory; it derives the actor from the seed, so a run of an `--actor` campaign is not
reproduced.

## Exit codes

| Code | Meaning |
| :--- | :--- |
| 0 | No run failed. |
| 2 | At least one run failed (`CHAOS_CAMPAIGN_FAILED`; for `chaos replay`, `REPLAY_FAILED`). |
| 4 | Internal chaos engine failure (for example an unknown actor). |

Codes 1 (recoverable findings) and 3 (unsafe configuration refused) are defined but no campaign produces them today:
every failed run counts as an invariant violation, and there is no current-directory mode left to refuse.

> [!NOTE]
> **Isolation.** Every campaign runs in a new directory of its own under the OS temp dir (`hardkas-chaos-<random>`),
> never in the current directory. It deletes only the workspace it created there and keeps its reports in
> `<run dir>/reports` (`chaos-report.json`, `chaos-summary.md`, and a `repro/` script per failed run). `chaos replay`
> removes its whole directory when it ends. `--isolate` is always on; `--unsafe-current-dir`, `--force-ci-chaos` and
> `--force-chaos-destructive` have no effect.
