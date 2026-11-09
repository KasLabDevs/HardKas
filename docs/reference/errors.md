# HardKAS Errors Reference

HardKAS uses strict typed errors for execution guardrails. This page documents the most common execution-related errors and how to fix them.

### `ACCOUNT_EXECUTION_MODE_MISMATCH`
**Cause:** You are trying to use an account that belongs to one execution mode in a different mode. For example, using a `synthetic` account (`kaspa:sim_...`) to sign a Localnet or Mainnet transaction.
**Example:** `ACCOUNT_EXECUTION_MODE_MISMATCH: Account 'alice' (mode: simulator) cannot be used in execution mode 'localnet'.`
**Solution:** Ensure you create and use the correct account type for your environment. Use `hardkas localnet account create` for Localnet instead of `hardkas simulator account create`.

### `ACCOUNT_NETWORK_MISMATCH`
**Cause:** The network configuration of the account (e.g., `simnet`) does not match the target network of the operation (e.g., `mainnet`).
**Example:** `ACCOUNT_NETWORK_MISMATCH: Account 'treasury' (network: simnet) cannot sign transactions for 'mainnet'.`
**Solution:** Check your `keystore.json` or dev-account files to ensure the `network` metadata matches the network you are trying to broadcast to.

### `CROSS_WORLD_ACCOUNT_COLLISION`
**Cause:** An account name (alias) exists in multiple storage locations but with conflicting types (e.g., as a synthetic account and as a real encrypted keystore).
**Example:** `CROSS_WORLD_ACCOUNT_COLLISION: Cross-world collision detected for account 'bob'. It exists as both 'synthetic' and 'kaspa' in different sources.`
**Solution:** HardKAS requires deterministic account resolution. Rename one of the accounts or delete the conflicting account to resolve the ambiguity.

### `EXECUTION_MODE_MISMATCH`
**Cause:** An artifact (TxPlan, SignedTx, TxReceipt) was generated in one execution mode but is being used in another.
**Example:** `EXECUTION_MODE_MISMATCH: Artifact mode 'simulator' does not match target mode 'localnet'.`
**Solution:** You cannot mix artifacts across worlds. If you generated a TxPlan via the Simulator, you must sign and replay it within the Simulator.

### `EXECUTION_DOMAIN_MISMATCH`
**Cause:** A cross-domain conflict between `kaspa-l1` and `evm-l2`.
**Example:** `EXECUTION_DOMAIN_MISMATCH: Target domain is 'kaspa-l1', but artifact execution specifies 'evm-l2'.`
**Solution:** Ensure your target network configuration matches the intended domain of the artifact.

### `EXECUTION_NETWORK_MISMATCH`
**Cause:** The artifact was built for a specific network (e.g., `testnet-10`), but the execution target is running on a different network (e.g., `mainnet`).
**Example:** `EXECUTION_NETWORK_MISMATCH: Artifact network 'testnet-10' does not match target network 'mainnet'.`
**Solution:** Rebuild your transaction plan targeting the correct network.

### `LOCALNET_PROFILE_REQUIRED`
**Cause:** You attempted to start or interact with Localnet without specifying a deployment profile.
**Example:** `LOCALNET_PROFILE_REQUIRED: A profile is required to start localnet (e.g., --profile toccata-v2).`
**Solution:** HardKAS no longer allows implicit global Localnet states. Provide the `--profile` flag to `hardkas localnet start` to specify the infrastructure topology.

### `NODE_NOT_SYNCED`
**Cause:** The node proved its identity but does not say it is synced. Operations that need the current chain state (`tx plan|send|wait`, `silver deploy|spend|covenant genesis|transition`, `escrow rescue-v1`) refuse it, the managed localnet included. A well-identified node is not a synced node.
**Solution:** Wait until the node reports `isSynced: true` (an idle simnet node with no miner turns unsynced after a while), then run the command again. Offline and diagnostic commands (`doctor`, `rpc info`, offline `artifact verify`) do not require it.

### `ALREADY_SUBMITTED`
**Cause:** `tx send` found that this payment was already sent: a submission recorded here (`recorded: true`), or positive evidence at the node with no local record (`recorded: false`: in its mempool, in this workspace's stored looks, or an output of the txId listed with the amount and script it pays). Nothing is sent again; `state` and `evidence` say what was seen.
**Solution:** Nothing to fix. Follow the transaction with `hardkas tx wait <txId>` or `hardkas tx status <txId>`.

### `INPUTS_SPENT_UNATTRIBUTED`
**Cause:** With `tx send --preflight`, an input of the transaction is no longer listed at its address, its creator is not in the node's mempool and no output of this transaction is listed: the input was spent, by a transaction HardKAS cannot name. Nothing is sent.
**Solution:** Plan a new payment from the current UTXOs. If this transaction may have been sent from elsewhere, look for it with `hardkas tx wait <txId> --address <an address it pays>`.

### `TX_WAIT_ACCEPTED_BEFORE_CURSOR`
**Cause:** `tx wait --address` found an output of the transaction already listed when the wait started: it was accepted before the scan's starting point, so the accepting block is not in the part of the chain being read. No state is claimed.
**Solution:** Run `hardkas tx wait <txId> --since <a chain block hash before the transaction>`.

### `ARTIFACT_NETWORK_MISMATCH`
**Cause:** `artifact verify --network <net>` was asked about an artifact of another network. Nothing is contacted.
**Solution:** Pass the artifact's own network (or omit `--network`), and a node of that network with `--url` for the network levels. Mainnet artifacts are verified offline only.

### `EXTENSION_NOT_PUBLISHED`
**Cause:** `hardkas extension install <id>` was asked to install from the registry an extension this release does not publish (`@hardkas/ext-l2` is `private`). No package manager runs.
**Solution:** Install it from a local tarball you trust: `hardkas extension install <id> --from <tgz> --sha256 <hex>`.

### `ZK_ENGINE_UNAVAILABLE`
**Cause:** A Groth16 pairing check needs the optional peer dependency `snarkjs` (GPL-3.0), which is not installed next to `@hardkas/sdk` / `@hardkas/cli`. The check is never reported as verified.
**Solution:** `npm install snarkjs@0.7.6` in the project that uses the SDK or the CLI, if you accept its license.
