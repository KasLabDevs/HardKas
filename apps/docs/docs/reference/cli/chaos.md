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
- `--profile &lt;smoke|targeted|full&gt;` (Default: `smoke`): No effect: smoke, targeted and full use the same actor weights
- `--actor &lt;LockHell|RotBot|DriftHunter|HumanChaos&gt;`: Target a specific chaos actor instead of using a profile
- `--isolate` (Default: `true`): Always on: every campaign runs in its own new temporary directory, never in the current one (the flag has no effect)
- `--unsafe-current-dir` (Default: `false`): No effect: a campaign never runs in the current directory; it runs in its own new temporary directory
- `--force-ci-chaos` (Default: `false`): No effect: there is no current-directory run to allow in CI
- `--force-chaos-destructive` (Default: `false`): No effect: there is no current-directory run whose guards could be bypassed

---

## `hardkas chaos replay`

### Synopsis (Generated)

**Purpose:** Re-run one chaos run seed in a fresh temporary directory of its own (the actor is derived from the seed, so runs from an --actor campaign are not reproduced)

#### Options

- `--run-seed &lt;number&gt;`: The run seed to replay
- `--isolate` (Default: `true`): Always on (the flag has no effect)

---

