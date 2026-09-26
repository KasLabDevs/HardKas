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
- `--profile &lt;smoke|targeted|full&gt;` (Default: `smoke`): Fuzzing distribution profile
- `--actor &lt;LockHell|RotBot|DriftHunter|HumanChaos&gt;`: Target a specific chaos actor instead of using a profile
- `--isolate` (Default: `true`): Run the chaos engine in a dedicated temporary workspace (Default)
- `--unsafe-current-dir` (Default: `false`): Run chaos in the current directory (DANGEROUS)
- `--force-ci-chaos` (Default: `false`): Allow unsafe chaos in CI environments
- `--force-chaos-destructive` (Default: `false`): Bypass workspace protection guards

---

## `hardkas chaos replay`

### Synopsis (Generated)

**Purpose:** Replay a specific chaos run deterministically

#### Options

- `--run-seed &lt;number&gt;`: The run seed to replay
- `--isolate` (Default: `true`): Run in isolated workspace

---

