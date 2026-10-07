---
title: hardkas chaos
---

# `hardkas chaos`

## `hardkas chaos`

### Synopsis (Generated)

**Purpose:** Run the internal Chaos Engine to stress-test the runtime experimental

#### Options

- `--runs &lt;number&gt;` (Default: `300`): Number of chaos iterations to run
- `--seed &lt;number&gt;` (Default: `1337`): Deterministic PRNG seed
- `--profile &lt;smoke|targeted|full&gt;` (Default: `smoke`): Actor weight profile (smoke, targeted and full currently use the same weights)
- `--actor &lt;LockHell|RotBot|DriftHunter|HumanChaos&gt;`: Target a specific chaos actor instead of using a profile
- `--isolate` (Default: `true`): Always on: chaos runs in ./.hardkas-chaos-workspace (the flag has no effect)
- `--unsafe-current-dir` (Default: `false`): Request a run in the current directory (DANGEROUS; needs HARDKAS_ALLOW_UNSAFE_CHAOS=1). Known issue: only the safety checks run, the campaign stays in the isolated workspace
- `--force-ci-chaos` (Default: `false`): Allow unsafe chaos in CI environments
- `--force-chaos-destructive` (Default: `false`): Bypass workspace protection guards

---

## `hardkas chaos replay`

### Synopsis (Generated)

**Purpose:** Re-run one chaos run seed in a fresh isolated workspace (the actor is derived from the seed, so runs from an --actor campaign are not reproduced)

#### Options

- `--run-seed &lt;number&gt;`: The run seed to replay
- `--isolate` (Default: `true`): Always on (the flag has no effect)

---

