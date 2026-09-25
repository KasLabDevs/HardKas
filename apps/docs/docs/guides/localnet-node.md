# First Real Node Transaction (Localnet)

Once you understand the [Simulator](../concepts/execution-environments.md), it's time to graduate to a **Real Node**. 

In this guide, you will use HardKAS Localnet to spin up a local Kaspa `kaspad` node in `simnet` mode, fund a real keypair, and execute a transaction that is validated by real Kaspa consensus.

## 1. Start the Localnet Node

HardKAS includes a built-in Docker orchestrator for Kaspa nodes. We will use the `toccata-v2` profile, which provides a fast-mining local environment.

```bash
hardkas localnet start --profile toccata-v2
```

Verify the node is running:

```bash
hardkas localnet status

# Expected Output:
# ℹ Node:  TOCCATA_NODE_READY
# ℹ Identity: VERIFIED (hardkas-kaspad-toccata-v2)
# ℹ RPC: ws://127.0.0.1:18210
```

## 2. Generate Real Developer Accounts

The Simulator uses synthetic `kaspa:sim_` addresses. For Localnet, we need real cryptographic Kaspa addresses (`kaspasim:`).

```bash
hardkas accounts real generate --name alice_real --network simnet
hardkas accounts real generate --name bob_real --network simnet
```

*Note: In development, you can append `--unsafe-plaintext` to skip keystore encryption, but this is strictly forbidden for Mainnet.*

## 3. Fund Your Account

Request KAS from the localnet CPU miner (faucet):

```bash
hardkas localnet fund alice_real --amount 100
```
*The command will pause while the local miner generates blocks to mature your coinbase UTXOs.*

## 4. The Lifecycle on a Real Node

Now we execute the standard HardKAS transaction lifecycle. The commands are identical to the Simulator, but under the hood, HardKAS is communicating via RPC with `kaspad`.

### Plan

```bash
hardkas tx plan --from alice_real --to bob_real --amount 10 --network simnet --out plan.json
```
*Unlike the Simulator, this step performs a live UTXO scan against the Kaspa DAG. It enforces maturity filters and pending-spend protections.*

### Sign

```bash
hardkas tx sign plan.json --account alice_real --out signed.json
```

### Submit & Wait for Finality

```bash
hardkas tx send signed.json --out receipt.json
```

## 5. The Replay Asymmetry

If you attempt to run `hardkas verify receipt.json` now, HardKAS will successfully cryptographically verify the artifact's integrity.

**However**, if you attempt a full stateful `replay` of a Real Node transaction, HardKAS will intentionally **fail closed**:

```bash
hardkas replay receipt.json
# ✗ Error: REPLAY_NOT_SUPPORTED_ON_REAL_NODE
```

### Why?
In the Simulator, HardKAS owns 100% of the state and can arbitrarily rewind time to verify determinism. On a Real Node, the UTXOs are now spent. Re-evaluating the plan against the *current* network state would yield a different outcome (UTXO not found). HardKAS mathematically seals the receipt as evidence, but prevents replay to protect you from accidental double-spend broadcast attempts or corrupted state assumptions.
