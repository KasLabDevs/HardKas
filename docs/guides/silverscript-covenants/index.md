---
title: SilverScript and Toccata covenants
description: What SilverScript and the Toccata upgrade add to Kaspa L1, and what HardKAS does with them, from compiling a contract to covenants and ZK locks.
---

# SilverScript and Toccata covenants

Toccata, active on Kaspa mainnet since June 30, 2026 (DAA score 474,165,565), extends Kaspa's UTXO validation with
covenants, transaction v1, compute budgets and a ZK verification opcode. SilverScript is the high-level language for
those contracts: its compiler, `silverc` v1.0.0, was released on 9 September 2026, and it compiles to the Kaspa Script
the node runs.

Toccata did not turn Kaspa into an EVM. It extends Kaspa's UTXO-native L1 validation model: there is no account-based
execution environment and no contract storage.

To try it first, follow [SilverScript and covenants on your simnet](../../start/silverscript-covenants.md): it compiles,
deploys and spends a contract, then creates and advances a covenant, on your own node, with real output. The pages of
this guide explain the model behind it:

- [Compile and verify](./compile-and-verify.md): what a compile record holds and how `silver verify` reproduces it.
- [The covenant model](./covenant-model.md): successor constraints, covenant ids, and the identifiers not to confuse.
- [Transaction v1 and the compute budget](./tx-v1-and-compute-budget.md): which commands build v1, and how compute is priced.
- [Covenant genesis and transition](./covenant-genesis-and-transition.md): the covenant commands, 1:1 and the other shapes.
- [ZK primitives and sequencing](./zk-and-sequencing.md): `OpZkPrecompile`, `OpChainblockSeqCommit` and HardKAS's ZK tools.
- [Testing Kaspa covenants](../testing-kaspa-covenants.md): which layer proves what.

## A language, not a virtual machine

Kaspa L1 does not execute SilverScript source code. The compiler translates a contract (constructor parameters, entries,
state, `require` conditions) into Kaspa Script opcodes; the node validates that script when a transaction spends the UTXO
it locks, and has no notion that SilverScript exists.

| Concept | Solidity / EVM | SilverScript / Kaspa |
| :--- | :--- | :--- |
| Execution environment | Account-based virtual machine | UTXO script validation |
| State storage | Persistent contract account | Carried in the UTXO's script or output |
| Global state access | Yes (can read any contract) | No (limited to the spending transaction) |
| Language target | EVM bytecode | Kaspa Script |

"Deploying" a contract means creating a UTXO locked by its script (a P2SH output). Nothing runs on the network between
transactions: a deployed contract is an output with spending conditions.

## What Toccata added

Toccata brought four consensus capabilities (KIPs 16, 17, 20 and 21), together with transaction v1 and compute pricing
(documented as KIP-24/25):

1. **Transaction v1 and compute budgets.** A new transaction version whose inputs declare a compute budget, which replaces
   the legacy `sig_op_count` and prices script execution in script units.
2. **Covenant introspection (KIP-17).** Opcodes that let a script read the transaction spending it, so a UTXO can constrain
   its own successor outputs.
3. **Covenant ids (KIP-20).** A 32-byte identifier, tracked by consensus, that follows a covenant across its UTXO lineage.
4. **ZK verification and sequencing (KIP-16, KIP-21).** `OpZkPrecompile` verifies a zero-knowledge proof inside a script;
   `OpChainblockSeqCommit` reads a chain block's sequencing commitment.

## L1 covenants, based ZK applications and L2 networks

These are different execution and trust models:

- **L1 covenants (Toccata).** A UTXO whose Kaspa Script constrains how it is spent and what output must come next. Every
  Kaspa node evaluates it during spend validation. Active consensus.
- **Based ZK applications (vProgs).** Execution happens off chain; Kaspa L1 verifies the resulting proof
  (`OpZkPrecompile`) and orders the state sequence. Upstream research; HardKAS's vProgs surface only inspects local
  artifacts.
- **Layer 2 networks (Igra, Kasplex L2).** Separate networks that use Kaspa for ordering and data availability. Their
  settlement depends on each L2's bridge and proof design, which HardKAS does not verify.

## What HardKAS does

HardKAS installs the pinned `silverc` (`hardkas toolchain install silverc`), compiles through it, deploys and spends on a
node you run, and writes a verifiable record of each step.

| Command | What it does | Evidence |
| :--- | :--- | :--- |
| `hardkas silver compile` | Runs the managed silverc v1.0.0 and records its provenance | Real-node corpus (simnet) |
| `hardkas silver verify` | Recompiles a record and checks it byte for byte | Offline |
| `hardkas silver inspect` | Shows a record's contracts, entries and state | Offline |
| `hardkas silver audit` | Heuristic static rules over a contract: findings to review, not a proof of security | Offline |
| `hardkas silver deploy` | Funds the contract's P2SH output on a node: transaction v0 by default, v1 with `--tx-version 1` | Real-node corpus (simnet) |
| `hardkas silver spend` | Spends it through one entry, with signatures from local accounts | Real-node corpus (simnet) |
| `hardkas silver covenant genesis` and `transition` | Create a covenant and advance it, 1:1 auth-bound, transaction v1 | Real-node corpus (simnet) |
| `hardkas silver covenant start` and `advance` | Several outputs, 1:N, N:M with delegates, termination (experimental) | Simnet suites |
| `hardkas silver covenant inspect` | A covenant's lineage from this workspace's records, its tip checked at the node | Simnet |
| `hardkas silver engine` | The SDK's v1 engine from the CLI: plan, sign, and drafts signed in turns by several parties | Simnet |
| `hardkas silver test` and `preflight` | The SilverScript runner (a local build, always UNVERIFIED); `silver test --on-node` asks a node instead (experimental) | Script engine, or the node's verdict |
| `hardkas silver doctor` | Whether the pinned toolchains and the node these commands would use are ready | Local and node |

The SDK has the same engine: `sdk.covenants` (`planGenesis`, `planTransition`, `planContractDeploy`, `planContractSpend`,
`check`, `sign`, `send`, and `inspect`, `history`, `lineage`, `getState` for a covenant's lineage). Compilation from code
is `sdk.experimental.silver` (`compile`, `reproduce`). KCC-20 tokens are `sdk.kcc20` and `hardkas kcc20` (experimental,
see [KCC-1, KCC-2 and KCC-20 support](../../reference/kcc.md)). Every option is in the
[CLI reference](../../reference/cli.md#hardkas-silver).

### Timelocks

- **Relative** (sequence locks): `silver spend --sequence <n>` sets the input's sequence. `silver spend` does not read the
  redeem script for it: the default is 0.
- **Absolute** (`CheckLockTimeVerify`): `--lock-time-daa <n>` (a DAA score) or `--lock-time-ms <t>` (milliseconds since the
  epoch) on `silver spend`, `silver covenant transition` and `silver covenant advance` (and `tx plan` / `tx send` for
  payments). The value is checked against the entry's `tx.daa` or `tx.time` statements before signing, and the spend is
  refused before the broadcast until the node has passed it (`LOCK_TIME_NOT_REACHED`, nothing sent).

### Where it runs

- **Simnet.** The canonical localnet (`hardkas localnet start --toccata`) or a node of your own (`--url`, or the one the
  workspace declares), which proves its identity by what it reports before any key is used. All the real-node evidence
  above is simnet.
- **Testnet-10.** Accepted behind the workspace opt-in (`experimental: true` and `network.allowPublic: true`), with
  `--yes` to confirm each broadcast. Not evidenced for these commands.
- **Mainnet** is locked down: no keys, no connection, no broadcast. SilverScript on mainnet is
  `SILVERSCRIPT_MAINNET_NOT_ENABLED`.

What a policy computes (a `require`, the conservation of amounts) is evaluated by the node, not by HardKAS before sending.
The simulator does not execute Kaspa script, so covenant logic is tested on a node. The current support boundary is in
[Covenants status](../../status/covenants-status.md) and [Limitations](../../status/limitations.md#silverscript-what-is-real-and-what-is-not-proven).
