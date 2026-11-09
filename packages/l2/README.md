# @hardkas/l2 (experimental Lab)

EVM JSON-RPC tooling for **Igra**, an EVM-compatible L2 built on Kaspa. Kaspa L1 does not execute EVM.
This package is a Lab: it is not part of the HardKAS L1 core (neither `@hardkas/cli` nor `@hardkas/sdk` depends on it),
and the `hardkas l2` CLI group comes with the `l2` extension, `@hardkas/ext-l2`.

**Not published in this release.** `@hardkas/l2` and `@hardkas/ext-l2` are private workspace packages (owner policy,
provisional, until their API, dependencies and promises are reviewed): `npm install @hardkas/l2` and
`hardkas extension install l2` cannot fetch them from npm. See `docs/status/versioning.md` ("Not published").

**This package is not a bridge.** HardKAS performs no deposits, withdrawals or custody. The bridge
information it returns is a set of static assumptions, not observations. Pre-ZK and MPC bridge phases
do not provide trustless exit. A ZK proof system alone does not make an exit trustless either: that
needs a proof-based withdrawal path that is actually deployed and live.

## Profiles

| Profile | Chain ID | Environment | Endpoint | Writes |
|---|---|---|---|---|
| `local` (default) | 31337 | local (Anvil) | `http://127.0.0.1:8545` | allowed, built-in fee ceilings |
| `igra-galleon` | 38836 | testnet | `https://galleon-testnet.igralabs.com:8545` | allowed with explicit fee ceilings |
| `igra-mainnet` | 38833 | **mainnet** | `https://rpc.igralabs.com:8545` | only with `allowMainnet: true` / `--allow-mainnet` and explicit fee ceilings |
| `igra-caravel` | 19416 | deprecated | none | disabled |

- With no profile name, the default is `local`. The name `igra` is ambiguous and is refused.
- The Galleon and mainnet values were copied from Igra's public network docs on 30-oct-2026. That is a
  documentary check only: HardKAS has not verified those endpoints operationally.
- The Caravel chain ID is not listed in Igra's docs and is kept only for legacy fixtures.

## Safety model for signing and broadcasting

- **Chain binding.** Every write is bound to a chain ID, taken from the profile or from
  `expectedChainId`. The RPC's `eth_chainId` must match it exactly and is parsed strictly. The chain ID
  is never taken from the RPC alone.
- **Mainnet guard.** A chain is mainnet when its chain ID is 1 or 38833, or when the profile's
  environment is `mainnet`. The profile name never decides this. Signing or broadcasting on mainnet
  requires `allowMainnet === true`. The CLI's `--yes` is a confirmation, not a mainnet authorization.
- **Fee ceilings.** Gas limit, fee per gas and worst-case total fee are capped. The caps apply to values
  you supply and to RPC estimates alike. Only `local` ships default caps; every other network requires
  explicit caps.
- **Broadcast integrity.** The txHash is always `keccak256(rawTransaction)`. If the node answers with a
  different hash, a `L2TxHashMismatchError` is raised and the call is never reported as a success. A lost
  response is reconciled by our own hash. When the outcome is unknown, an `UncertainBroadcastError` is
  raised: poll the hash, do not re-sign.
- **Every broadcast path is guarded.** The low-level `EvmJsonRpcClient.sendRawTransaction(raw, options)`
  requires write options. Before the RPC call it checks the chain the raw transaction is signed for, the
  transaction type, mainnet authorization and the fee ceilings. There is no unguarded variant.
  `sendRawTransactionResilient` and `sendAndConfirmTransaction` go through it. The generic
  `callRpc(method, params)` forwards only read methods (plus `anvil_` / `evm_` / `hardhat_` dev-node
  control on a client bound to a local chain); anything that can sign or broadcast is refused with
  `L2_RPC_METHOD_FORBIDDEN` before any request.
- **Refused vs. uncertain.** A local refusal (guard, malformed raw) is a typed `L2SafetyError`: nothing was
  sent. Only a failure after the request left (lost connection, HTTP error, timeout, invalid response) is
  reconciled by hash and may end in `UncertainBroadcastError`. A JSON-RPC rejection from the node is definite.
- **Receipts.** A receipt must belong to our hash. An unknown status is never treated as success. If no
  receipt arrives in time, `L2TxPendingError` is raised; this means pending, not failed.
- **CREATE deployments.** The contract address is derived from (sender, nonce) and must equal the
  receipt's address. CREATE2 deployments go through a factory, via `writeContract`.
- **Artifacts (CLI).** Plan and signed artifacts are re-hashed before use. The signed transaction must
  match the plan field by field, and its sender is recovered from the signature.

## What the RPC tells you is not a proof

Receipts, confirmations and canonicality checks are reports from a single RPC provider
(`observation: "rpc_reported"`). Nothing here verifies settlement on Kaspa L1
(`l1SettlementStatus: "unverified_on_l1"`). L2 confirmations are not finality.

## Tests

| Command | Scope |
|---|---|
| `pnpm vitest run packages/l2` | Unit and adversarial tests against an in-process mock JSON-RPC (part of the hermetic gate) |
| `pnpm vitest run --config vitest.anvil.config.ts` | Needs a local Anvil: native, or Docker with the pinned image already present (no pulls) |
| `TEST_IGRA_GALLEON=1 pnpm vitest run --config vitest.l2-live.config.ts` | Read-only calls to the public Galleon endpoint |
