# Kaspa L1 vs. Igra L2

HardKAS provides a unified interface for both the Kaspa Layer 1 protocol and the emerging Igra Layer 2 ecosystem. Understanding the boundary between these two layers is critical for secure and efficient development.

## Layer 1: Kaspa BlockDAG

**Identity**: The foundation.
**Architecture**: UTXO-based, high-throughput BlockDAG.
**Characteristics**:
- **Programmability**: Limited (OP_CODES, multi-sig, timelocks). No native EVM.
- **State**: The UTXO set.
- **Deterministic**: Yes, via GHOSTDAG consensus.

In HardKAS, L1 development focuses on **Transaction Planning**, **Mass Auditing**, and **UTXO Management**.

## Layer 2: Igra

**Identity**: The programmability extension.
**Architecture**: EVM-compatible, Account-based.
**Characteristics**:
- **Programmability**: Full Solidity/EVM support.
- **State**: Account balances and contract storage.
- **Relationship to L1**: Secured by Kaspa via optimistic or ZK proofs (depending on bridge stage).

In HardKAS, L2 development focuses on **Contract Deployment**, **RPC Interoperability**, and **Bridge Awareness**.

## Critical Boundaries

> [!IMPORTANT]
> **No EVM on L1**: Kaspa L1 does not execute smart contracts. All "smart" logic happens on Igra (L2) and is settled on Kaspa (L1).

> [!WARNING]
> **Account Models**: Do not confuse Kaspa `UTXO` addresses with Igra `Account` addresses. While they may share a derivation path, they represent different state models.

## How HardKAS Handles Both

HardKAS uses **Artifact Differentiation** to separate these worlds:
- `hardkas.txPlan.v2`: A standard Kaspa UTXO transaction.
- `hardkas.igraTxPlan.v1`: An Igra EVM transaction.

By keeping these schemas distinct, HardKAS prevents "L1-L2 confusion" and ensures that developers are always aware of which security model they are interacting with.
