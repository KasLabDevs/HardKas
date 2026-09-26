# Layer 2 Boundaries & Trust Models

> **vProgs Status:** ACTIVE DEVELOPMENT / PROTOTYPE | **Igra / Kasplex L2:** EXTERNAL ARCHITECTURES

As Kaspa expands its capabilities post-Toccata, the term "Layer 2" (L2) is often overloaded. It is critical to distinguish between the different architectures leveraging Kaspa.

## Sovereign Verifiable Programs (vProgs)

* **Execution:** Off-chain sovereign runtime.
* **VM Compatibility:** Custom verifiable programs (e.g., RISC Zero guests). Not EVM.
* **Settlement:** Kaspa L1 covenants using `OpZkPrecompile`.
* **State:** Application state is off-chain; L1 only tracks state roots and sequencing commitments.

## EVM-Compatible Based Rollups (Kasplex L2 / Igra)

Kaspa L1 **does not execute EVM bytecode**, and Toccata is not an EVM hard fork.

External projects (like the Igra implementation or Kasplex L2 architecture) may build EVM-compatible "based rollups". 
* **Execution:** Off-chain EVM node.
* **VM Compatibility:** EVM.
* **Sequencing:** Derives ordering from Kaspa L1 (Based).
* **Bridge:** May rely on trusted MPC (Multi-Party Computation) bridges initially, or validity-proof (ZK) bridges if/when fully implemented.

*Note: Kasplex L1 (Asset Hub) is distinct from Kasplex L2 Architecture.*

## The "Trustless" Terminology Trap

Avoid using the word "trustless" casually when describing L2s or bridges.

1. **Validity-Proof Enforced Exit:** A ZK bridge uses Kaspa's `OpZkPrecompile` to verify that an L2 withdrawal is valid according to the L2's state rules. This removes the need to trust an MPC committee for *correctness*.
2. **Remaining Trust Assumptions:** Even with a ZK bridge, you must still trust:
   * **Data Availability:** Can you get the data needed to construct the withdrawal proof?
   * **Operator Liveness:** Will the sequencer/prover actually process your exit?
   * **Censorship Resistance:** Can you force an L1 exit if the L2 sequencer ignores you?

A bridge is only as secure as its weakest assumption. Toccata's consensus primitives do not automatically make an external bridge "trustless" simply by existing.
