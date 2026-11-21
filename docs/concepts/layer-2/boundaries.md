---
title: Layer 2 Boundaries and Trust Models
description: How vProgs and EVM-compatible rollups such as Igra relate to Kaspa L1, what a bridge still asks you to trust, and what HardKAS does with L2.
---

# Layer 2 Boundaries and Trust Models

> [!NOTE]
> **vProgs:** an upstream prototype in active development. **Igra and Kasplex L2:** external projects. HardKAS's L1
> CLI and SDK send no L2 transactions and perform no bridge operations.

Since Toccata, "Layer 2" (L2) is used for very different architectures built around Kaspa. Keep them apart.

## Verifiable programs (vProgs)

- **Execution:** an off-chain, sovereign runtime.
- **VM:** custom verifiable programs (for example RISC Zero guests), not the EVM.
- **Settlement (as designed):** Kaspa L1 covenants that verify a proof with the Toccata ZK precompile (`OpZkPrecompile`).
- **State:** the application state is off-chain; L1 tracks state roots and sequencing commitments.

See [What is vProgs?](../vprogs/what-is-vprogs.md).

## EVM-compatible based rollups (Igra, Kasplex L2)

Kaspa L1 **does not execute EVM bytecode**, and Toccata is not an EVM hard fork. External projects such as Igra and
the Kasplex L2 architecture build EVM-compatible "based rollups":

- **Execution:** an off-chain EVM node.
- **Sequencing:** derived from Kaspa L1 ordering ("based").
- **Bridge:** may rely on a trusted MPC (multi-party computation) committee at first, and on validity proofs only if
  and when a proof-based withdrawal path is deployed.

Kasplex L1 (an asset hub for native assets on Kaspa L1) is distinct from the Kasplex L2 architecture.

## The "trustless" trap

Do not call an L2 or a bridge "trustless" casually.

1. **A validity-proof exit** uses Kaspa's ZK precompile to check that a withdrawal is valid under the L2's state rules.
   That removes the need to trust an MPC committee for *correctness*.
2. **Trust that remains** even then:
   - **Data availability:** can you get the data needed to build the withdrawal proof?
   - **Operator liveness:** will the sequencer or prover process your exit?
   - **Censorship resistance:** can you force an exit on L1 if the sequencer ignores you?

A bridge is only as safe as its weakest assumption. Toccata's consensus primitives do not make an external bridge
trustless by existing. Pre-ZK and MPC phases give no trustless exit, and a proof system alone does not either until a
proof-based withdrawal path is live.

## What HardKAS does with L2

- The L1 CLI registers no L2 command group, and the SDK's L2 operations refuse (`L2_NOT_IN_CORE`). The capability report
  (`capabilities.get()`) says `trustlessExit: false`.
- The Igra L2 lab is the experimental `l2` extension (`@hardkas/ext-l2`, over `@hardkas/l2`). Neither package is
  published in this release, so `hardkas extension install l2` refuses (`EXTENSION_NOT_PUBLISHED`) unless you install a
  local build with `--from <tgz> --sha256 <hex>` ([not published](../../status/versioning.md#not-published)).
- `hardkas vprogs` inspects local vProgs artifacts only: there is no vProgs runtime in HardKAS, and no on-chain ZK
  verification is claimed.
- The execution target's `evm-l2` domain is reserved: a Kaspa account is refused there (see
  [execution worlds](../execution-worlds.md#the-executiontarget)).
