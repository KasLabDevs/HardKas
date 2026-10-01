---
title: Planning
sidebar_position: 3
---

import QualificationContext from '@site/src/components/QualificationContext';

# Transaction Planning

Once UTXOs are discovered and filtered for safety, the planning phase determines exact coin selection, geometric bounds, and transaction graph construction.

**Architecture Principle:** HardKAS orchestration owns the workflow safety (UTXO maturity, pending-spend filtering), but the **Planner** owns the transaction construction decisions.

## The Planner

Every plan, from the CLI (`tx plan`) or the SDK (`tx.plan()`), for the simulator or a real node, comes from the official `kaspa-wasm` Generator of the pinned SDK: it selects the inputs, computes mass and fee, and makes the change. HardKAS adapts its `PendingTransaction` into a `TxPlanArtifact`, and refuses what one plan cannot represent:

| Condition | Error |
|-----------|-------|
| The inputs do not fit in one standard transaction (the Generator would need several) | `MULTI_TRANSACTION_PLAN_REQUIRED` |
| The change the payment leaves is too small for a standard output | `CHANGE_BELOW_STANDARD_OUTPUT` |
| A payment output is too small for a standard output | `OUTPUT_BELOW_STANDARD_AMOUNT` |

| Environment | `plannerAuthority` Evidence | Safety Wrapper |
|-------------|-----------------------------|----------------|
| Simulator | `SYNTHETIC_SIMULATOR` | None required |
| Real Node | `KASPA_WASM_GENERATOR` | Virtual Fingerprint & Pending-Spend |

> *Note: the testing harness's synchronous `send()` (`applySimulatedPayment`) still prices through a compatibility shim until its API migrates; it is the only code allowed to use it.*

## `plannerAuthority` Provenance

When inspecting a `TxPlanArtifact`, the `provenance.plannerAuthority` field declares what the plan was made for.

- **`KASPA_WASM_GENERATOR`**: The plan was made by the Generator for a real Kaspa network.
- **`SYNTHETIC_SIMULATOR`**: The plan was made by the same Generator for the Simulator, over its synthetic identities (`kaspa:sim_*` aliases, mock scripts) priced as simnet. It is NON-AUTHORITATIVE: no node validates what the Simulator executes.

> **Important:** `plannerAuthority` is provenance data, not a security rating or a consensus guarantee. Furthermore, its absence does not imply synthesis; historically, CLI plans omitted this field.

## Coin Selection

The Generator takes the UTXOs in the order their source lists them (the node, or the Simulator state); HardKAS adds no selection policy of its own. The same UTXOs in the same order give the same plan on every surface.

## The `TxPlanArtifact`

The output of the planning phase is the `TxPlanArtifact`. This is a heavily schema-constrained JSON document.

### What it contains
- **Identity:** `artifactId` (the canonical locator of this planning event).
- **Inputs & Outputs:** The exact UTXO outpoints consumed and the scripts created.
- **Amounts:** Total spent and change generated.
- **Fees/Mass:** Exact sompi fee and computed mass.
- **Network:** Targeted execution mode (e.g., `simulator`, `rpc`).
- **Integrity:** `contentHash` protecting the geometric payload.

### What it proves
It proves that, at a specific moment in time (captured by `virtualDaaScore`), a geometrically valid, fee-paying transaction was mathematically possible using the sender's available UTXOs.

### What it does NOT prove
It does not prove that the sender authorized it (no signature exists yet), nor does it guarantee that the UTXOs will remain unspent by the time execution occurs.

<QualificationContext capabilityId="artifacts" />
