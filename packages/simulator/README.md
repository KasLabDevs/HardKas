# @hardkas/simulator

**Status: EXPERIMENTAL.** An in-memory Kaspa node for local development and fast tests: it starts without Docker,
answers the wRPC (SerdeJson) and an HTTP JSON-RPC like rusty-kaspad 2.1.0, mines on demand, and takes snapshots.
It **approximates** the node's rules. It is **not consensus-equivalent** and nothing it accepts or refuses is evidence of
what a rusty-kaspad would do: validate timelocks, covenants, masses and transaction rules against a real node (the
simnet harness of `@hardkas/testing`).

```ts
import { createKaspaSimulator, SimulatorRpcServer } from "@hardkas/simulator";
const sim = createKaspaSimulator({ networkId: "simnet", bootstrapDevAccounts: true });
const server = new SimulatorRpcServer(sim);
const { wsUrl } = await server.start({ port: 19110 }); // loopback by default
```

CLI: `hardkas simulator start` or the `kaspa-simulator` binary (`--help`).

## Identity: never the canonical node

- `getServerInfo`/`getInfo` report `2.1.0-kaspa-simulator` (`SIMULATOR_SERVER_VERSION`).
- `@hardkas/core` keeps a separate expectation for it (`SIMULATOR_NODE_EXPECTATION`, kind `kaspa-simulator`, own port,
  no container). The canonical expectation (container, image digest, endpoint) refuses it, so `hardkas localnet`,
  `hardkas silver deploy|spend|covenant`, `capabilities` and `SimnetNodeHarness.attach` never take it for rusty-kaspad.
- `HARDKAS_SIMULATOR` / `HARDKAS_ALLOW_SIMULATOR_NODE` have no effect (they used to switch the canonical check off).
- Default port 19110: never a canonical localnet port nor a Kaspa network's. `mainnet` is refused (the dev accounts'
  keys derive from a public seed: never send real funds to them).

## What follows rusty-kaspa v2.1.0 (and from where)

| Area | Source of truth |
| :-- | :-- |
| Signature hash | `@hardkas/core` (upstream vectors) |
| v0 transaction id | local hasher (`id_v0`), checked against kaspa-wasm |
| v1 transaction id | the managed kaspa-wasm only; without it `SIMULATOR_TXID_V1_UNAVAILABLE` (no fallback) |
| Masses | `@hardkas/tx-builder` v1-mass (compute, transient normalized, KIP-9 storage with covenant plurality) |
| Relay fee | 100 sompi per gram of max(compute, normalized transient); storage mass not charged |
| Coinbase maturity | 1000 DAA scores (10 BPS) |
| Fee estimate | node shape only, every bucket at the minimum feerate |
| Unconfirmed chains | a child may spend a mempool parent's output (`UNACCEPTED_DAA_SCORE`); blocks take parents first |
| Acceptance | a block's transactions are accepted by the chain block that merges it |

## Known divergences (do not rely on the simulator for these)

- **Script VM and covenants**: see the consensus notes of `src/script` (timelocks, covenant contexts and introspection were
  contrasted with a real node in the 6-nov-2026 audit; check every contract on simnet).
- **GHOSTDAG**: approximate engine, default K = 18 (the network's is 124); coloring, reorgs and merged-block
  transactions differ (`docs/ghostdag-architecture.md`).
- **Ledger timing**: a block's transactions are applied when it is mined (the node applies them per accepted chain block).
- **Mempool**: no orphan pool (`allowOrphan` ignored), no replace-by-fee (`submitTransactionReplacement` →
  `SIMULATOR_RBF_UNSUPPORTED`), no standardness of script classes, no fee market.
- **Standard mass**: only the block mass limits are enforced; whether the node's mempool also bounds compute mass at
  100 000 (kaspa-wasm's `maximumStandardTransactionMass`) was not verified.
- **Coinbase**: one output to the miner, simulator-only transaction id (not the consensus id), native subnetwork.
- **Block template / headers**: zero merkle roots and commitments; DAA score +1 per block; pruning point at genesis;
  past median time from the last 11 chain blocks.
- **Dust rule** (600 sompi) comes from the simulator, not from rusty-kaspa's mempool.
- **RPC**: about 35 methods; an unknown one is an error (`SIMULATOR_RPC_METHOD_UNSUPPORTED`). `getTransaction` is a
  simulator extension. Browser origins are refused unless allowed (`allowedOrigins`); the `kaspasim_*` dev methods can be
  switched off (`devMethods: false`).

## Tests

`pnpm --filter @hardkas/simulator test` runs the unit suite: it checks the simulator against itself (and kaspa-wasm
where a test says so), never against a node. Tests that need the managed kaspa-wasm are skipped, with the reason, when it
is not installed. Comparisons with rusty-kaspad are `*.simnet.test.ts` (Docker; they fail without the node).
