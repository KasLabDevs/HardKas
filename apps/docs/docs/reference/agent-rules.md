---
title: AGENT.md rules
---

HardKAS is designed to be readable by AI coding agents without letting them invent unsupported behavior.

Rule

Reason

Run `hardkas capabilities --json` first.

Prevents agents from assuming features that are not implemented.

Run `hardkas doctor --json` before runtime work.

Captures local environment readiness.

Prefer `--json` for automation.

Keeps machine workflows stable.

Default to localnet/local profiles.

Avoids accidental mainnet mutation.

Do not invent txids, balances, finality or trustlessness.

Preserves protocol honesty.

Respect trust boundaries.

HardKAS is local developer tooling, not production protocol validation.
