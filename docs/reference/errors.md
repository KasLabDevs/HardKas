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

### `MAINNET_CONNECTION_DISABLED`
**Cause:** An operation would reach a mainnet node: a read (`rpc *`, `accounts balance`, `doctor`, `observe`), a plan (`tx plan`, `sdk.tx.plan`, a workflow's first step), a wait or status look (`tx wait`, `tx status`, `sdk.tx.observe`), a wallet (`sdk.wallet.open`, `WalletToolkit.watch`), a node set (`rpc compare`), a fork, a script or a Silver/covenant command's node. HardKAS makes no connection to mainnet at all (MAINNET TOTAL LOCKDOWN, owner decision 2026-11-09): the network asked for, the network its config entry declares (an alias such as `prod` with `network: "mainnet"`) and every spelling (`mainnet`, `mainnet-1`, `kaspa`, `kaspa-mainnet`, any case) are refused before an endpoint is even read, so nothing is contacted. An endpoint declared as another network (or a raw `--url`) whose node answers mainnet is refused right after that one identity answer (`getServerInfo`), and nothing else is asked of it; that single exchange is the one thing a client cannot avoid when an endpoint is not what it was declared to be. On an L2 client (`@hardkas/l2`) the same code refuses a mainnet profile or chain (Igra mainnet 38833), or an `eth_chainId` answer naming one.
**Example:** `MAINNET_CONNECTION_DISABLED: mainnet connections are disabled in HardKAS (the node endpoint of 'mainnet'), reads included, even to an endpoint you declare. … Nothing was contacted.`
**Solution:** None in this release: no flag, option, environment variable or configuration enables it (`allowPublic`, `experimental`, `allowMainnet`, `HARDKAS_*` have no effect). Use simnet, devnet or a testnet. Mainnet records stay verifiable offline (`hardkas artifact verify <file>` reports `INTEGRITY_VERIFIED` and the network level `NOT_CHECKED`, reason `MAINNET_NETWORK_CHECK_BLOCKED`). `hardkas doctor` reports it as its connectivity check's code (status `skip`), or, for an endpoint declared as another network whose node answers mainnet, as the network-identity check's code and the partial diagnosis' headline. `hardkas tx status` and `hardkas tx wait` fail with it as the JSON envelope's `code` (non-zero exit) when a look would read mainnet; `tx wait` ends at once instead of waiting out `--timeout`. `tx status --no-observe` takes no look and stays offline. The code is decided before the network name is resolved and before the public-network gate, so `--network kaspa|mainnet-1|kaspa-mainnet|MAINNET` and an invocation outside a workspace give it too (never `UNKNOWN_NETWORK`, `RUN_NETWORK_UNKNOWN` or `PUBLIC_NETWORK_BLOCKED`); a send gives `MAINNET_BROADCAST_DISABLED` and a signature `MAINNET_SIGNING_DISABLED` (below), and Silver commands keep `SILVERSCRIPT_MAINNET_NOT_ENABLED`, for the name and an alias that declares it alike.

### `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`
**Cause:** A signature (`tx sign`, `sdk.tx.sign`, an external signer, the accounts and PSKT signers, offline signing included) or a broadcast (`tx send`, `sdk.tx.send`, the toolkit wallet) involving mainnet in any of its identities: the artifact's network, its execution's, the instance's or what its config entry declares. Raised before any connection, any signer call and any record. The operation's own guard names the refusal: a signature is `MAINNET_SIGNING_DISABLED` and a broadcast `MAINNET_BROADCAST_DISABLED`; anything else that would reach a mainnet node is `MAINNET_CONNECTION_DISABLED` (above). On L2, an Igra mainnet write is `L2_MAINNET_WRITE_BLOCKED`, whatever `allowMainnet` / `--allow-mainnet` say.
A Toccata ZK spend is refused as a signature too: `buildR0Groth16Transaction` and `buildR0Groth16Plan` (`sdk.zk.toccata.buildTransaction` / `buildPlan`) with a mainnet `networkId` (any spelling) throw `MAINNET_SIGNING_DISABLED` before the scripts or the UTXO are read. A ZK spend carries no signature: its signature script (journal hash, proof, redeem script) is the authorization, so the transaction those functions build is complete and any tool could broadcast it. Until the crypto review's H5 they built it and only warned (`ZK_MAINNET_BUILD_UNGUARDED`, removed).
**Solution:** None in this release. HardKAS produces no signed mainnet transaction, and no complete mainnet ZK spend.

### `NODE_NOT_SYNCED`
**Cause:** The node proved its identity but does not say it is synced. Operations that need the current chain state (`tx plan|send|wait`, `silver deploy|spend|covenant genesis|transition`, `escrow rescue-v1`) refuse it, the managed localnet included. Since RC1 the SDK's `tx.send` (and `covenants.send`, which is `tx.send`) refuses it too, before anything is sent or recorded. A well-identified node is not a synced node.
**Solution:** Wait until the node reports `isSynced: true` (a fresh simnet node with no miner says `false` until it mines a block with a current timestamp, and an idle one turns unsynced after a while), then run the command again. Offline and diagnostic commands (`doctor`, `rpc info`, offline `artifact verify`) do not require it. For a controlled local simnet or devnet only, the SDK's `tx.send(signed, { allowUnsyncedNode: true })` sends anyway.

### `SEND_UNSYNCED_NODE_NOT_ALLOWED`
**Cause:** `tx.send(signed, { allowUnsyncedNode: true })` on a network other than simnet or devnet. A node that does not say it is synced is never used for a send there. Nothing is sent or recorded.
**Solution:** Use a synced node. The option is for controlled local networks only.

### `LOCK_TIME_NOT_SUPPORTED`
**Cause:** A lock time other than 0 was asked of `tx.plan`, or a plan given to the signer states one. HardKAS builds and signs every transaction with lock time 0 in this release (no absolute time locks, CLTV). Nothing is planned or signed.
**Solution:** Drop the lock time. Design for a later cycle: `docs/proposals/cltv-and-ecdsa-spends.md`.

### `ECDSA_SPEND_NOT_SUPPORTED`
**Cause:** A spend from an ECDSA P2PK address (version 1, script `21 <33-byte key> ab`): HardKAS signs Schnorr P2PK spends only, so it refuses to plan it (`tx.plan`, `hardkas tx plan`, consolidations) or to sign an input of that kind, before any UTXO is read or any key is used. Paying to an ECDSA address is supported; an unlocking script the caller makes itself (a signature-script authorization) is used as given.
**Solution:** Spend from a Schnorr address. Design for a later cycle: `docs/proposals/cltv-and-ecdsa-spends.md`.

### `ALREADY_SUBMITTED`
**Cause:** `tx send` found that this payment was already sent: a submission recorded here (`recorded: true`), or positive evidence at the node with no local record (`recorded: false`: in its mempool, in this workspace's stored looks, or an output of the txId listed with the amount and script it pays). Nothing is sent again; `state` and `evidence` say what was seen.
**Solution:** Nothing to fix. Follow the transaction with `hardkas tx wait <txId>` or `hardkas tx status <txId>`.

### `INPUTS_SPENT_UNATTRIBUTED`
**Cause:** With `tx send --preflight`, an input of the transaction is no longer listed at its address, its creator is not in the node's mempool and no output of this transaction is listed: the input was spent, by a transaction HardKAS cannot name. Nothing is sent.
**Solution:** Plan a new payment from the current UTXOs. If this transaction may have been sent from elsewhere, look for it with `hardkas tx wait <txId> --address <an address it pays>`.

### `TX_WAIT_ACCEPTED_BEFORE_CURSOR`
**Cause:** `tx wait --address` found an output of the transaction whose DAA score (its accepting chain block's) is at or before the scan's starting point, and could not move that point back before it: the bounded walk back from the node's sink (`--lookback`, default 1000 chain blocks) ran out, was disabled (`--lookback 0`), the node did not serve a block of the walk, or the starting point was an explicit `--since` (never moved). The message gives the output's DAA score, the cursor's, the distance and how far the walk went. No state is claimed.
**Solution:** Run `hardkas tx wait <txId> --since <a chain block hash before that DAA score>`, or a larger `--lookback` (at most 10000).

### `ARTIFACT_NETWORK_MISMATCH`
**Cause:** `artifact verify --network <net>` was asked about an artifact of another network. Nothing is contacted.
**Solution:** Pass the artifact's own network (or omit `--network`), and a node of that network with `--url` for the network levels. Mainnet artifacts are verified offline only.

### `EXTENSION_NOT_PUBLISHED`
**Cause:** `hardkas extension install <id>` was asked to install from the registry an extension this release does not publish (`@hardkas/ext-l2` is `private`). No package manager runs.
**Solution:** Install it from a local tarball you trust: `hardkas extension install <id> --from <tgz> --sha256 <hex>`.

### `ZK_ENGINE_UNAVAILABLE`
**Cause:** A Groth16 pairing check needs the optional peer dependency `snarkjs` (GPL-3.0), which is not installed next to `@hardkas/sdk` / `@hardkas/cli`. The check is never reported as verified.
**Solution:** `npm install snarkjs@0.7.6` in the project that uses the SDK or the CLI, if you accept its license.

### `ZK_VERIFYING_KEY_NOT_PINNED`, `ZK_VERIFYING_KEY_NOT_FOUND`, `ZK_CONTROL_ROOT_NOT_PINNED`, `ZK_CONTROL_ID_NOT_PINNED`
**Cause:** `hardkas zk toccata verify-scripts` / `verifyR0Groth16Scripts` was given a RISC Zero Groth16 lock whose verifier is not the pinned one: the verifying key handed to `OpZkPrecompile` (the push right before the Groth16 tag `0x20`) is not `R0_GROTH16_COMPRESSED_VERIFICATION_KEY_HEX`, or no key is pushed there, or the script does not push the pinned control root (`R0_GROTH16_CONTROL_ROOT`, as its two 16-byte halves) or BN254 control id (`R0_GROTH16_BN254_CONTROL_ID`, risc0 v3.0.4). Whoever knows the trapdoor of another key can forge a receipt for the lock's image id, so pushing the right image id is not enough. The result has `ok: false` (CLI exit 1) and `verifyingKeyPinned` / `controlRootPinned` / `controlIdPinned` say which part differs.
**Solution:** Do not fund such a lock. Build locks with `hardkas zk toccata build-scripts` (kaspa-wasm 2.1.0 `ZkScriptBuilder`).

### `ZK_REDEEM_SCRIPT_NOT_CANONICAL`, `ZK_EXPECTED_BINDING_NOT_ENFORCED`
**Cause:** `verify-scripts` rebuilds the redeem script from the parameters it carries (the image id of its first push; in output-bound mode the payout, the change and the input limit) with the builders `build-scripts` uses, and compares the bytes. `ZK_REDEEM_SCRIPT_NOT_CANONICAL`: they differ (the message says where the reading stopped), so `consensusEnforced` is `false` and no `enforces*` / `bound*` field is set: nothing is inferred from the presence of introspection opcodes (before the crypto review's H2 a count pushed and dropped, or a change never compared, passed). `ZK_EXPECTED_BINDING_NOT_ENFORCED`: expected outputs (`--expected-payout-*`, `--expected-change-*`) were given for a script that is not such an output-bound lock, for example a proof-only lock, which binds no output.
**Solution:** Use a lock built by `build-scripts`, or review the foreign script by hand: HardKAS makes no claim about it.

### `ZK_BOUND_PAYOUT_SPK_MISMATCH`, `ZK_BOUND_PAYOUT_AMOUNT_MISMATCH`, `ZK_BOUND_CHANGE_SPK_MISMATCH`, `ZK_BOUND_CHANGE_AMOUNT_MISMATCH`, `ZK_BOUND_CHANGE_MISSING`
**Cause:** A canonical output-bound lock binds another payout or change (output 1) than the one expected (`--expected-payout-address|amount`, `--expected-change-address|amount`; SDK `expectedPayout*` / `expectedChange*`), or binds no change when one was expected. The bound values are in `boundPayoutSpk`, `boundPayoutAmount`, `boundChangeSpk`, `boundChangeAmount` and `boundMaxInputSompi`.
**Solution:** Check the lock's outputs before funding it; the redeem script, not the expectation, decides where the funds can go.

### `ARTIFACT_HASH_MISMATCH`
**Cause:** The artifact's content no longer hashes to the `contentHash` it carries: it was edited after it was sealed. `tx sign`, `tx send` and `artifact verify` (CLI), and `sdk.tx.sign`, `sdk.tx.send` and `sdk.artifacts.verify(..., { throwOnInvalid: true })` (SDK) refuse it with this code before anything is signed, sent or contacted.
**Solution:** Use the artifact as it was written, or produce a new one (`tx plan`, `tx sign`).

### `NO_SPENDABLE_UTXOS`
**Cause:** The sender has nothing to spend: no UTXOs, or only coinbase outputs that are not mature yet (the message says how many were left out as immature). The CLI's `tx plan` and the SDK's planner (`sdk.tx.plan`) raise the same code.
**Solution:** Fund the address, or wait until its coinbase outputs pass the network's coinbase maturity.

### `DOCTOR_NETWORK_REQUIRED`, `DOCTOR_FLOW_INVALID`, `DOCTOR_TIMEOUT_INVALID`
**Cause:** Usage errors of `hardkas doctor`'s node options, raised before anything runs: `--url` with no network for the node to prove (the workspace runs on the simulator, or there is none); a `--flow` other than `payment`, `silver`, `covenant`; a `--timeout` outside 100–120000 ms.
**Solution:** Pass `--network <name>` with `--url`; fix the option. The node checks' own codes (`NODE_REACHABLE`, `NODE_UNREACHABLE`, `NODE_TIMEOUT`, `NODE_NETWORK_MISMATCH`, `NODE_IS_SIMULATOR`, `NODE_VERSION_UNEXPECTED`, `NODE_NOT_SYNCED`, `MAINNET_CONNECTION_DISABLED` (it was `MAINNET_NOT_CONTACTED`), `PUBLIC_NETWORK_BLOCKED`, `NO_NODE_CONFIGURED`, `FLOW_READY`, …) are in the report's `checks[].code`, not errors.
