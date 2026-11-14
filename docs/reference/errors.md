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
The CLI commands that make a key or a lock refuse mainnet with `MAINNET_SIGNING_DISABLED` too, before any key exists: `accounts real generate` and `accounts real import`, `kaspa wallet create` (with or without `--show-private-key`) and `zk toccata build-scripts --address-network`, for every spelling of mainnet (and, for the account and wallet commands, every config alias that declares it).
**Solution:** None in this release. HardKAS produces no signed mainnet transaction, and no complete mainnet ZK spend.

### `ZK_RECEIPT_VERIFIER_PARAMETERS_MISMATCH`
**Cause:** A RISC Zero Groth16 receipt (`zk toccata verify-receipt`, `zk toccata build-scripts`, `verifyR0Groth16ReceiptLocal`, `buildR0Groth16Scripts`) names verifier parameters other than the pinned RISC Zero verifier's (`R0_GROTH16_VERIFIER_PARAMETERS_DIGEST`, risc0 3.0.4/3.0.5): it was made for another verifier, for example another risc0 release, and its proof would not verify against the verifying key and control root the Toccata lock pins. `build-scripts` builds nothing.
**Solution:** Prove the program again with the risc0 release rusty-kaspa 2.1.0 pins (risc0-groth16 3.0.4, risc0-circuit-recursion 4.0.4).

### `SEQUENCE_LOCK_NOT_YET_MET`
**Cause:** A v1 spend (`sdk.tx.send` / `sdk.covenants.send`, e.g. an escrow refund after its timeout) has an input whose relative time lock (its `sequence`, in DAA) the node's virtual DAA score has not reached: the input's UTXO was accepted at DAA score S, the lock is N, so it can be spent from DAA score S + N. Refused by the send preflight before the broadcast, so nothing is sent or recorded. Sent anyway, the node would reject it (`SEQUENCE_LOCK_REJECTED`) and that rejection would be the transaction's one recorded submission; the identical valid spend has the same txId and could never be sent again (`TX_ALREADY_SUBMITTED`).
**Solution:** Send the same signed transaction again once the node's virtual DAA score reaches the score the message names (at 10 blocks per second, about N/10 seconds after the UTXO was accepted).

### `MAINNET_UNPLANNED_SEND_REFUSED`
**Cause:** A send of a signed transaction that names no plan of the workspace (`sdk.tx.send(signed, { allowUnplannedSignedTransaction: true })`, CLI `tx send --allow-unplanned`) involving mainnet in any of its identities. A mainnet transaction goes out only with the plan that authorized it, so HardKAS can check the signed transaction against it (`SIGNED_PLAN_MISMATCH`) and check its fee limit. This rule is permanent: it does not depend on the mainnet lockdown, so lifting the lockdown would not lift it. While the lockdown holds, a mainnet send is refused first with `MAINNET_BROADCAST_DISABLED` (above). Raised before any connection or record.
**Solution:** Send a mainnet transaction from a plan of the workspace (plan → sign → send). The escape is for simnet, devnet and testnets only.

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

### `TX_SEND_CONFIRMATION_REQUIRED`
**Cause:** `tx send` on a network that is not local (a testnet, or a node endpoint) without `--yes`. Nothing was planned, signed, broadcast or written. Exit code 3 (policy denied); with `--json` the envelope has `outcome: "not_executed"` and the command to run.
**Solution:** Run the same command again with `--yes` once you mean to send.

### `TX_ALREADY_SUBMITTED`
**Cause:** `sdk.tx.send` (and `tx send` of a signed file) found a submission of this txId already recorded in the workspace. HardKAS sends a transaction once: it never sends a recorded txId again, whatever happened to it. The message names the state derived from the record and the node's answers. When the node no longer holds the transaction (the state is `SUBMITTED`, `REORGED` or `REJECTED_BY_NODE`: for example a node or container restart emptied its mempool), it says how to get out, and the error's metadata carries `remedy: "replan-new-txid"`. When the outcome is unknown, it only says to observe it, because a new payment could pay twice.
**Solution:** Run `hardkas tx status <txId>` first. If the payment reached its recipient, or its inputs are spent, do not pay again. Otherwise plan the payment again with a different fee or amount (a new txId), then sign and send that one.

### `SEND_PLAN_UNRESOLVED`
**Cause:** A real (non-simulated) send of a signed transaction that names its plan (`lineage.parentArtifactId`), when that plan is not in this workspace with a verified identity. HardKAS checks a signed transaction against the plan that authorized it before broadcasting, so it refuses to send without it. Nothing is sent or recorded.
**Solution:** Send from the workspace that holds the plan, or copy the plan's artifact into `.hardkas/artifacts`. A signed transaction with no plan at all can be sent with `--allow-unplanned` (`allowUnplannedSignedTransaction`), never on mainnet (`MAINNET_UNPLANNED_SEND_REFUSED`).

### `FEE_EXCEEDS_MAX`
**Cause:** The transaction pays a fee above its limit: the plan's `maxFeeSompi`, or `networks.<name>.maxFeeSompi` in the workspace config when that is lower. Raised at plan, sign or send time, before the step is done (the message says which). A v1 plan (`sdk.covenants`) checks its own recorded limit the same way.
**Solution:** Check the outputs: a fee far above the node's minimum usually means change was not returned. Raise the limit only if the fee is intended.

### `TX_WAIT_TIMEOUT`
**Cause:** `tx wait` reached `--timeout` before the transaction reached the `--until` state. The message gives the last derived state and, when nothing locates the transaction (no recorded submission, no `--since`), how the scan of the node's chain proceeds.
**Solution:** Run the wait again to continue from where it stopped, or pass `--since <a chain block hash before its acceptance>`, or `--address <an address it pays>`.

### `TX_WAIT_UTXO_VIEW_STALE`
**Cause:** `tx wait --address` reached the requested state from the node's chain, but the node's UTXO index does not show it yet at the addresses given: no output of the transaction is listed there, and nothing accepted at or after its accepting block is listed either. The index may trail the chain, or the transaction's outputs there were spent since by a transaction that pays elsewhere. Balances read from the node now could be stale.
**Solution:** Wait again with a larger `--timeout`, or pass an address where something newer is listed (for example the change address of a later payment).

### `REPLAY_MODE_UNSUPPORTED`
**Cause:** `hardkas replay verify` / `sdk.replay.verify` was given a real-node send or a node plan. Replay re-executes simulator runs only. Nothing was executed.
**Solution:** Check a real send with `hardkas verify <submission>` and `hardkas tx status <txId>`.

### `NODE_IMAGE_DIGEST_REQUIRED`
**Cause:** `HARDKAS_KASPAD_IMAGE` (or `node start --image`) names a node image by tag only (for example `kaspanet/rusty-kaspad:latest`). A tag can be moved; only a digest names the image that was validated. Refused before Docker is asked to run anything, by `hardkas node start`, the node runner (`localnet start`, `node restart|reset`, `sdk.node.start`) and the simnet test harness.
**Solution:** Pin the image by digest (`<image>@sha256:<64 hex>`), or unset the variable to use the reference image HardKAS pins.

### `UTXO_SET_NOT_STABLE`
**Cause:** `localnet fund` mined, but the funded address's UTXO set did not converge to the required spendable amount: part of the balance is immature coinbase, or the node's index had not settled. The message gives the spendable and required amounts, the immature coinbase and the DAA score.
**Solution:** Run `localnet fund` again, or wait for the coinbase outputs to mature (1,000 DAA on simnet).

### `LOCALNET_PORT_CONFLICT`
**Cause:** `localnet start` found the localnet's RPC port already served by a node HardKAS does not manage. HardKAS refuses to adopt it, because `localnet fund` attaches the miner by container name and would fail.
**Solution:** Stop the other node, or run `hardkas localnet stop --profile toccata-v2` first.

### `LOCALNET_DOCKER_UNAVAILABLE`
**Cause:** Docker could not report the state of a localnet container, so nothing about the localnet can be confirmed. Usually Docker is not running.
**Solution:** Start Docker (Docker Desktop on Windows and macOS) and run the command again.

### `KEYSTORE_PASSWORD_REQUIRED`
**Cause:** An encrypted keystore account must be opened (to sign, export or change its password) and no password was given. A prompt is offered only on a terminal, for commands that allow one. Nothing is written. Exit code 2.
**Solution:** Pass the password with `--password-env <VAR>` or `--password-stdin` (SDK: `keystorePassword`).

### `ACCOUNT_NAME_TAKEN`
**Cause:** `accounts real generate` or `accounts real import` was given a name that already exists in the workspace, in `.hardkas/accounts.real.json` or `.hardkas/keystore/` (case-insensitive). Nothing is created or overwritten. Exit code 2.
**Solution:** Choose another `--name`.

### `ACCOUNT_ADDRESS_KEY_MISMATCH`, `INVALID_PRIVATE_KEY_MATERIAL`
**Cause:** `accounts real import`: the `--address` given is not the address of the imported key on its network, so the account could never sign for it (the message gives the key's real address); or the key is not a 32-byte key (64 hex characters). Nothing is imported. Exit code 2. A simulator identity (`kaspa:sim_…`) is not checked.
**Solution:** Pass the key's own address, or omit `--address`.

### `STALE_ARTIFACT_REFUSED`
**Cause:** Signing, sending or simulating refused a plan or signed transaction older than 30 days, or a signed transaction whose plan is: the outputs it spends have most likely moved since it was planned. Its integrity is not in question: `hardkas artifact verify` still verifies it, with a `STALE_ARTIFACT` warning that names its age. Receipts, submissions and observations are records of the past and are never refused for their age. Nothing is signed, sent or recorded.
**Solution:** Plan the payment again.

### `TX_WAIT_USAGE`
**Cause:** A usage error of `tx wait`, raised before anything is contacted: among others, a `--timeout` or `--interval` that is not a non-negative number of seconds (`500ms`, `60s` and `2m` are accepted). Exit code 2.
**Solution:** Fix the option.

### `V1_REMAINDER_FEE_ABOVE_LIMIT`
**Cause:** A v1 engine plan whose fee is "whatever the outputs leave" would pay more than the larger of HardKAS's default fee limit (0.1 KAS, `DEFAULT_MAX_FEE_SOMPI`) and the node's floor for that transaction, and the caller set no `maxFeeSompi`. This is `sdk.covenants.planContractSpend` without `sweepTo`, or `planTransition` paid by the covenant without a `"rest"` continuation (also `hardkas silver engine plan spend|transition`). Usually an output was left out: a 100 KAS contract output spent with one 1 KAS payment would otherwise pay 99 KAS to the miner. Nothing is planned, stored or signed. Metadata: `feeSompi`, `limitSompi`, `floorSompi`, `inputSompi`.
**Solution:** Give `sweepTo` (a contract spend), or a `"rest"` continuation or a funder (a transition), so the rest comes back and the fee is the floor. To pay that fee on purpose, give an explicit `maxFeeSompi` of at least that amount.

### `CHANGE_BELOW_STANDARD_OUTPUT`
**Cause:** `tx plan` / `sdk.tx.plan`: the inputs the planner (kaspa-wasm's Generator) chose cover the payment and fee so closely that the change left is too small for a standard output: its storage mass (KIP-9) would put the transaction above the standard limit. The planner turns only dust into fee; any larger remainder stays the sender's, so the plan is refused instead of paying it to the miner. Nothing is planned.
**Solution:** Adjust the amount slightly, send the whole balance, or consolidate first (`hardkas accounts consolidate`).

### `PSKT_SIGNER_NETWORK_REQUIRED`, `PSKT_NETWORK_MISMATCH`, `PSKT_INPUTS_UNVERIFIED`, `PSKT_INPUT_NOT_ON_NETWORK`
**Cause:** `pskt sign` / `pskt.signSession`. A PSKT session's `networkId` is only what its author wrote, and a Kaspa signature does not commit to a network, so HardKAS signs only for the network the signer names, and only inputs that network's node lists as unspent. These checks run after the mainnet refusal and before the key file is read.
- `PSKT_SIGNER_NETWORK_REQUIRED` (exit 2): no signer network was given (`--network`, the workspace config's network, SDK `context.networkId`).
- `PSKT_NETWORK_MISMATCH` (exit 3): the session declares another network than the signer's.
- `PSKT_INPUTS_UNVERIFIED` (exit 1): the inputs could not be checked: no node is configured for that network (the simulator, or a testnet without `networks[<name>].rpcUrl`), the node could not be asked, or the payload's inputs cannot be read.
- `PSKT_INPUT_NOT_ON_NETWORK` (exit 1): the node does not list an input to be signed as unspent. It may be spent or not yet accepted, or an output of another network, mainnet included, where a signature would be valid.

Nothing is signed.
**Solution:** Sign in a workspace of the session's network, with that network's node declared (`rpcUrl`).

### `DEPLOY_INIT_FILE_EXISTS`
**Cause:** `hardkas deploy init` would overwrite profile files already in the directory (`docker-compose.yml`, `Dockerfile`, `.env.example`, `PRODUCTION_CHECKLIST.md`). Every target is checked before anything is written. Exit code 2.
**Solution:** Move the files aside, or pass `--force`.

### `RPC_DOCTOR_NOT_READY`
**Cause:** `hardkas rpc doctor` found at least one requested endpoint not ready: unreachable, a protocol or RPC error, or refused as mainnet (`REFUSED: MAINNET_CONNECTION_DISABLED` in the report). The report names each one. Exit code 1.
**Solution:** Fix or remove the endpoint the report names.

### `WALLET_TOOLKIT_METHOD_UNSUPPORTED`, `INDEXER_ARTIFACT_IDENTITY_INVALID`
**Cause:** `WalletToolkit.planSend()` and `sendSimulated()` never planned or sent anything (they returned placeholder data) and now refuse. `IndexerToolkit.ingestArtifact()` indexes only a HardKAS artifact whose `contentHash` its content verifies; the artifact given has none, or a wrong one.
**Solution:** Use `wallet.estimateFee()` (its `plan` is the real plan), `wallet.send()`, or `hardkas.tx.plan` / `hardkas.tx.send`. Index artifacts as HardKAS writes them.

### `WALLET_WATCH_NODE_NETWORK_CHANGED`
**Cause:** After a reconnection, the node behind a `WalletToolkit.watch()` URL named another network than before. The watch was stopped, and nothing that node answered was reported. A node naming mainnet gives `MAINNET_CONNECTION_DISABLED`.
**Solution:** Check what serves that URL, then start the watch again.

### `SESSION_OPERATION_UNSUPPORTED`, `SIMNET_MINE_BLOCKS_INVALID`, `SIMNET_MINE_NO_PROGRESS`, `SIMNET_MINE_UNOBSERVED`
**Cause:** Dev-server API.
- The session routes `start`, `snapshot`, `time-travel`, `export` and `import` are not implemented (HTTP 501); they used to answer `ok: true` with invented ids.
- `POST /api/simnet/mine?blocks=N` needs an integer N from 1 to 100 (HTTP 400).
- After mining, the node's DAA score did not advance, or could not be read (HTTP 502); the answer carries the scores seen.
**Solution:** Do not rely on the session routes. Mine 1–100 blocks at a time, and check the node when mining makes no progress.

### `SEQUENCE_LOCK_UNVERIFIABLE`
**Cause:** A v1 transaction about to be sent has an input whose sequence enables a relative time lock, and the node's virtual DAA score or the UTXO's DAA score could not be read, so whether the lock is met cannot be checked. Sent and rejected, the identical transaction could never be sent again (one submission per txId). Nothing is sent or recorded.
**Solution:** Retry when the node answers `getBlockDagInfo` and lists the UTXO with its DAA score.

### `ESCROW_CONFIG_INVALID`
**Cause:** `createEscrow` / `escrowResolution` refused the escrow's configuration. Among other cases: a v2 full escrow (no `version`, or `version: "v2"`, not split) that names different amounts for its one principal (`principal`, `refundAmount`, `releaseAmount`), or none; or an `escrowNonce` that is not 32-byte hex.
**Solution:** Give `principal` alone, or `version: "v1"` for a legacy escrow whose refund and release amounts differ.

### `RESCUE_ESCROW_ARGS_INVALID`, `RESCUE_LOCK_MISMATCH`
**Cause:** `hardkas escrow rescue-v1 prepare` rebuilds the v1 escrow's script from its seven constructor arguments (`--buyer-pk`, `--seller-pk`, `--arbiter-pk`, `--buyer-destination`, `--seller-destination`, `--refund-amount`, `--release-amount`).
- `RESCUE_ESCROW_ARGS_INVALID` (exit 2): one is missing or malformed: a key that is not 32-byte x-only hex, a destination that is neither an address nor script hex, an amount that is not a positive integer.
- `RESCUE_LOCK_MISMATCH` (exit 1): the script they compile is not `--address`, or the outpoint the node lists is locked to another script.

Nothing is read or written.
**Solution:** Give the exact values of the escrow's `createEscrow({ version: "v1" })` config.

### `ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED`, `ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE`
**Cause:** The RISC Zero program's receipts are published (`PUBLIC_R0_TEST_VECTORS`: the kaspa-python-sdk vector and HardKAS's own fixture receipt), matched on the image id whatever the journal.
- A **proof-only** lock of such a program (or a lock whose redeem script does not bind the outputs) on a public network is anyone-can-spend, so no address is built (`ZK_PUBLIC_VECTOR_PUBLIC_NETWORK_REFUSED`).
- A **proof-and-output-bound** lock is built, with the warning `ZK_PUBLIC_PROGRAM_PAYOUT_TRIGGERABLE`: its funds can only go to the bound outputs, but anyone holding the published receipt can trigger that payout at any time.
**Solution:** Build a proof-and-output-bound lock, use simnet, or use a program whose receipts are private.

### `ZK_BOUND_LOCK_UNSPENDABLE`, `ZK_BINDING_LABEL_NOT_ENFORCED`, `ZK_RECEIPT_CLAIM_UNCHECKED_PUBLIC_NETWORK_REFUSED`
**Cause:**
- `ZK_BOUND_LOCK_UNSPENDABLE`: `verifyR0Groth16Scripts` found a canonical output-bound lock that can never be spent: a bound output of zero or less, or an input limit not above the sum of the bound outputs. A UTXO funded there stays locked forever.
- `ZK_BINDING_LABEL_NOT_ENFORCED` (warning): `buildR0Groth16Transaction` was given a scripts object labelled `proof-and-output-bound` whose redeem script does not enforce that binding. `consensusEnforced` is then false.
- `ZK_RECEIPT_CLAIM_UNCHECKED_PUBLIC_NETWORK_REFUSED`: the receipt carries its claim unpruned, so neither the claim cross-check nor the verifier-parameters check could run. No testnet address is built; simnet still is, with `ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED`.
**Solution:** Do not fund an unspendable lock. Rebuild scripts with `buildR0Groth16Scripts` instead of assembling them. Use a receipt with its claim pruned (the rusty-kaspa zk-sdk format, 325 bytes).

### `LOCALNET_TIMEOUT_INVALID`, `LOCALNET_SEED_INVALID_AMOUNT`, `LOCALNET_FUND_INVALID_AMOUNT`
**Cause:** `localnet fund` / `localnet seed`: `--timeout` is not a positive whole number of milliseconds, or an amount cannot be parsed or is not positive. Nothing is done. Exit code 2.
**Solution:** Fix the option.

### `LOCALNET_DAG_SETTLE_TIMEOUT`
**Cause:** After the localnet miner was stopped, the chain did not settle (the same virtual state on consecutive reads) within the bound (the caller's remaining time, at least 60 s). The message says why: the node reports virtual DAA score 0 (no block was ever mined), or its virtual state kept changing (something still produces blocks).
**Solution:** Check the miner container and that nothing else mines on the node, then run the command again.

### `LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN`, `LOCALNET_TREASURY_PENDING_UNRESOLVED`
**Cause:** `localnet seed` / `localnet fund --treasury` pay from the localnet treasury, whose key is public by design and used on simnet only.
- `LOCALNET_TREASURY_SUBMIT_OUTCOME_UNKNOWN`: a treasury transaction was sent and no usable answer came back, so the node may hold it. It is recorded in `localnet/treasury-pending.json` under `HARDKAS_HOME` (`~/.hardkas` by default): one journal per machine, like the localnet. The next `localnet seed` or `fund --treasury` on this machine, from any workspace, sends that same transaction again and waits for it; it never pays again.
- `LOCALNET_TREASURY_PENDING_UNRESOLVED`: such a transaction is now refused by the node and no output of it is found, so HardKAS cannot tell whether its recipients were paid. It pays nobody from the treasury in this workspace.
**Solution:** For the second code, check the recipients' balances, then remove `<HARDKAS_HOME>/localnet/treasury-pending.json` to pay them again.

### `LOCALNET_TREASURY_INCOMPLETE`, `LOCALNET_TREASURY_TRANSFER_UNPLANNABLE`
**Cause:**
- `LOCALNET_TREASURY_INCOMPLETE`: a treasury run failed after it broadcast something. The message lists what was broadcast and which accounts were funded, and the liveness miner is restarted unless `--stop-miner` was asked. Failures that have their own code keep it and carry the same lists.
- `LOCALNET_TREASURY_TRANSFER_UNPLANNABLE`: one payment does not fit in one standard transaction and is too small to split further (parts are at least 1 KAS). Larger payments are split over several transactions.
**Solution:** Check the listed accounts before running again; `--only-empty` skips the funded ones.
