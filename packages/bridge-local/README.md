# `@hardkas/bridge-local`

The `bridge-local` package acts as an offline, deterministic laboratory for Kaspa L1 -> Igra L2 bridge interactions. It is **not** a production bridge client; it is an assumption-aware simulator.

## 1. Bridge Simulation Variants

In HardKAS, "bridging" involves generating deterministic payloads and analyzing cross-chain logic without actually burning funds on mainnet or waiting for finality.

### Flow: Local Plan (`hardkas bridge local plan`)

1. Fetches current UTXO balances from the local Kaspa simnet node.
2. Constructs an L1 Kaspa transaction that pays to the simulated bridge contract address.
3. Attaches an OP_RETURN payload containing the L2 Igra receiver address.
4. Persists a `BridgePlan` artifact, logging the L1 and L2 linkage.

### Variant: Prefix Mining Simulation (`hardkas bridge local simulate --prefix abc`)

To test how bridge indexing reacts to specific transaction IDs:

1. The simulator overrides standard PRNG algorithms.
2. It forcefully increments an internal nonce on the Kaspa L1 payload until the resulting `txId` SHA-256 hash begins with the requested prefix (`abc`).
3. This computationally intense simulation is confined entirely to memory and only persists the final successful `BridgePlan` artifact.

## 2. Security Assumptions (Pre-ZK Phase)

HardKAS natively documents and enforces the evolutionary phases of the Kasplex/Igra bridge architecture.

### Variant: Trustless Exit Constraints

If an AI agent or a developer attempts to simulate a "trustless withdrawal" from L2 back to L1:

1. The `bridge-local` policy engine checks the `phase` metadata variable.
2. In the current `0.7.9-alpha` (Pre-ZK phase), `trustlessExit` is hardcoded to `false`.
3. The SDK throws a `PROTOCOL_ASSUMPTION_VIOLATION` if the user tries to assert a ZK exit proof that does not yet exist in the underlying protocol architecture.
