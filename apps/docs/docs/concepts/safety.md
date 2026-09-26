---
title: Safety Model
---

import QualificationContext from '@site/src/components/QualificationContext';

The HardKAS Safety Model is designed to protect the developer workflow from common errors, state corruption, and accidental cross-contamination. 

It is critical to understand the boundary of this protection: **Safety Orchestration ? Consensus**. HardKAS protects your inputs, your plans, and your local workspace state. However, the Kaspa protocol's consensus rules alone determine the ultimate validity of a transaction on the network.

## Developer Workflow Protections

HardKAS applies strict safety boundaries at multiple stages of the transaction lifecycle:

### Maturity Filtering
Kaspa UTXOs require a specific number of block confirmations (DAA score) before they can be spent (especially coinbase outputs). HardKAS planners actively filter immature UTXOs during the planning phase to prevent transactions that would be immediately rejected by the node.

### Pending-Spend Protection
To prevent accidental double-spending within the local workspace, HardKAS tracks UTXOs that have been allocated to a `TxPlanArtifact` but have not yet been confirmed on the network. These pending spends are isolated so subsequent plans do not inadvertently reuse them.

### Virtual-State Stability & Retry
When operating against live RPC nodes, state can shift between planning and submission (e.g., a block is found). HardKAS uses virtual state tracking and retry mechanisms to gracefully handle transient DAG changes without corrupting the local artifact lineage.

### Post-Plan Input Validation
Before a plan is passed to the signer, HardKAS performs secondary validations (e.g., fee limit policies, change address verification) to ensure the deterministic output of the planner matches the developer's declared constraints.

### Network and Account Guards
HardKAS acts as a fail-closed boundary against environment mismatch. The **Execution Guard** prevents a plan generated for `simnet` from being executed on `mainnet`, and prevents an account intended for L2 from signing an L1 Kaspa transaction.

## Local Filesystem Boundaries

HardKAS enforces safety at the workspace level using atomic persistence and file-based locking (`.hardkas/locks/`). 

These mechanisms prevent concurrent developer processes (or CLI tabs) from mutating the same artifact index or query store simultaneously. 
*These are local development protections; they are not properties of the Kaspa protocol.*

## Limits of the Safety Model

- HardKAS **does not provide absolute safety**.
- HardKAS **does not replace custody solutions**.
- A successfully planned and signed transaction is not "guaranteed" to be mined; network conditions (fees, reorgs) are resolved by Kaspa consensus, not by HardKAS.

<QualificationContext capabilityId="workspaceLocks" />
