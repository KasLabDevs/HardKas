---
title: PSKT (not in this build)
description: Partially Signed Kaspa Transactions are not available in this build; how an external key signs instead.
---

# PSKT (Partially Signed Kaspa Transactions)

> [!WARNING]
> **Not in this build.** `hardkas pskt` is hidden, and no PSKT adapter implements an operation: `export`, `import`,
> `sign`, `merge`, `finalize` and `extract` refuse with a typed error, and `hardkas pskt capabilities` reports every
> operation as unavailable. `hardkas pskt inspect` shows a session file's metadata only: it does not decode the payload,
> so it shows no inputs, outputs, amounts or recipients and is no pre-signing check. The native PSKT addon
> (`@hardkas/pskt-native`) is on hold and not published.

PSKT is the upstream Kaspa format for carrying a transaction between machines while signatures accumulate (offline,
air-gapped or multi-party signing). It is a transport container, not a spending condition: multisig is a script that
consensus enforces, and a PSKT only carries the transaction to its signers.

Without PSKT in this build, an external key signs outside HardKAS, or through a
[browser wallet](../../start/browser-wallets.md) (experimental). `hardkas tx sign --threshold` is a synthetic multisig
for tests: it produces no Kaspa multisig script. See the [security model](../security-model.md#when-hardkas-does-not-hold-the-key).
