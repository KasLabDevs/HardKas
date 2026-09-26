---
title: Kaspa L1 vs Igra L2
---

System

Role

HardKAS treatment

Kaspa L1

Proof-of-work blockDAG, sequencing, data availability, state anchoring and finality via GHOSTDAG / future DAGKnight model.

HardKAS queries RPC, manages local wallets and simulates workflows. It does not validate consensus.

Kasplex L1

Asset hub for native asset issuance and transfer on Kaspa L1.

Distinguished from Kasplex L2 architecture terminology.

Igra L2

EVM-compatible L2 execution environment in the based-rollup architectural class.

HardKAS provides profiles, RPC health, balance/nonce queries, tx build/sign/send/status and contract deploy planning.

Bridge phases

Pre-ZK → MPC/committee-style assumptions → ZK exit phase.

Pre-ZK bridge workflows are assumption-aware; trustless exit is false until ZK phase.

**No EVM on Kaspa L1.** HardKAS documentation and examples must preserve this boundary. Execution happens on L2, not on Kaspa L1.
