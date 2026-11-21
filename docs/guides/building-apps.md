---
title: "Building Apps on HardKAS"
description: "Integration patterns for building Kaspa apps on HardKAS, what the repository contains for each today, and where real-node verification is listed."
---

# Building Apps on HardKAS

An earlier SDK integration gauntlet exercised the integration patterns below. Their example applications were removed when
the repository surface was cut down, so the claims of that gauntlet are not re-verified here. Each section points to what the
repository contains today; what HardKAS verifies against a real node is listed in
[what works](../start/what-works.md).

These are integration patterns, not production applications.

## Patterns

### Wallet Backend

Local planning, signing and UTXO balance checks for a wallet backend.
_See: [examples/02-basic-transfer](../../examples/02-basic-transfer) and the
[simnet quickstart](../start/quickstart-simnet.md)._

### Payroll Automation

Deterministic batch payments from one treasury to several recipients without reusing a UTXO (`hardkas tx batch`), one
transaction per payment, or all of them in one transaction with one fee (`hardkas tx batch --one-transaction`).
_See: the `tx batch` entry of the [CLI reference](../reference/cli.md)._

### DAO Multisig Flow

A multi-step signature pipeline: a plan artifact passed between stakeholders, partially signed and verified before it is
sent. Its example was removed; the native PSKT adapter it used is on hold and not published.

### CI Artifact Verification

Running the CLI headless in CI to check that workflow artifacts verify and replay deterministically.
_See: [examples/04-trace-and-replay](../../examples/04-trace-and-replay) and [examples/workflows](../../examples/workflows)._

### Game Backend Simulation

High-frequency micro-transactions through the Igra L2 local adapter. Its example was removed, and the L2 packages are not
published in this release (experimental, private): this is not EVM execution on Kaspa L1.
