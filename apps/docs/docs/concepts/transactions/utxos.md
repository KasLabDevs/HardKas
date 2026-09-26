---
title: UTXO Discovery & Safety
sidebar_position: 2
---

import QualificationContext from '@site/src/components/QualificationContext';

# UTXO Discovery

Before a transaction can be planned, HardKAS must discover which UTXOs (Unspent Transaction Outputs) are available to fund the intent. 

## Sources of Truth

HardKAS dynamically resolves UTXOs based on the execution environment:
- **Simulator (`simulated`)**: Reads UTXOs directly from the local `.hardkas/localnet.json` synthetic state.
- **Real Node (`kaspa-rpc` / `localnet`)**: Queries the Kaspa network via JSON-RPC (`getUtxosByAddress`).

## Safety Orchestration

**HardKAS Safety Filtering ≠ Kaspa Consensus Validation.**

UTXO discovery and pre-planning safety are **execution-path dependent**. The CLI real-node path applies strict filtering *before* passing UTXOs to the underlying planner algorithm; other paths have their own boundaries. 

### 1. Maturity Filtering
If a UTXO is a coinbase output, HardKAS enforces maturity limits. The protocol requires coinbase outputs to mature for a specific number of DAA blocks (e.g., 100).
- **HardKAS Margin:** For CLI real-node environments, HardKAS orchestration applies a safety margin of `+ 10 DAA blocks` on top of the protocol requirement to protect against `mempool-vs-virtual-DAA` races.

### 2. Pending-Spend Protection
HardKAS tracks UTXOs that have been signed and submitted to the mempool but are not yet reflected in the DAG (`excludeOutpoints`). It automatically excludes these outpoints from discovery to prevent frustrating double-spend errors during local testing.

### 3. Virtual State Fingerprinting
When pulling UTXOs from a real Kaspa node via RPC, HardKAS takes a fingerprint of the `virtualDaaScore` before and after discovery. If the DAG state changes during the read phase, HardKAS throws a `UtxoVirtualStateUnstableError` or retries the operation, ensuring the planner always operates on a stable state snapshot.

## Important Semantic Distinction

**Fund recipient eligibility does NOT equal signing authority.**
Just because HardKAS discovers UTXOs at an address and builds a transaction plan does not mean the user actually holds the private key required to authorize those inputs. Discovery operates strictly on public DAG data.

<QualificationContext capabilityId="mempoolContamination" />
