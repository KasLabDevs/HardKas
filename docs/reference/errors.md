---
title: Errors Reference
description: The stable HardKAS error codes, what raises each one, and how to recover.
---

# HardKAS Errors Reference

HardKAS fails with typed errors instead of stack traces. Pass `--json` to any command to get the stable `code` (the
JSON envelope's `code`, or `checks[].code` in a `doctor` report). The exit code says what kind of failure it was:
1 a runtime failure, 2 a usage error, 3 a policy refusal (nothing was executed), 4 detected corruption.

Match the code to its boundary first: workspace and configuration, the node, accounts and signing, planning, artifacts
and evidence, or submission. The [Troubleshooting guide](../guides/troubleshooting.md) walks the common symptoms, and
[AI Troubleshooting & Error Codes](../ai/troubleshooting.md) gives the most frequent codes with a diagnostic and a
recovery command each.

### `ACCOUNT_EXECUTION_MODE_MISMATCH`
**Cause:** Defined in `@hardkas/core` for an account used in another execution mode than its own, but no code path raises it today: a simulator (`synthetic`) account used on a node is refused with `ACCOUNT_NETWORK_MISMATCH` (below).
**Solution:** Use an account of the environment: `hardkas localnet account create` for the localnet instead of `hardkas simulator account create`.

### `ACCOUNT_NETWORK_MISMATCH`
**Cause:** The account does not belong to the operation's target: a simulator (`synthetic`) account used with a mode other than `simulator`, or an account whose `network` is not the target's network (for example a `simnet` account on `testnet-10`). The message has the form `Account network mismatch. Expected: …, Actual: …`.
**Solution:** Use an account created or imported for the target network; check the account's `network` in `.hardkas/accounts.real.json`.

### `CROSS_WORLD_ACCOUNT_COLLISION`
**Cause:** An account name exists in two sources with different kinds: an account declared in the workspace config whose kind (`synthetic` for `simulated`, `kaspa`) differs from the stored account of the same name. The message names the account and both kinds.
**Solution:** HardKAS requires deterministic account resolution. Rename one of the accounts or remove the conflicting one.

### `EXECUTION_MODE_MISMATCH`
**Cause:** An account or an artifact of another execution mode than the target's: a non-simulator account on the simulator, a simulator account on a node target (`localnet`, `rpc`), or an artifact (plan, signed transaction, receipt) whose recorded execution mode is not the target's. The message has the form `Execution mode mismatch. Expected: …, Actual: …`.
**Solution:** You cannot mix the simulator's accounts and artifacts with a node's. Plan, sign and replay a simulator flow within the simulator; plan again for a node.

### `EXECUTION_DOMAIN_MISMATCH`
**Cause:** The target's domain, or an artifact's recorded domain, is not the other's (`kaspa-l1` against `evm-l2`). Kaspa L1 accounts never operate in `evm-l2`. The message has the form `Execution domain mismatch. Expected: …, Actual: …`.
**Solution:** Use a `kaspa-l1` target for HardKAS L1 accounts and artifacts.

### `EXECUTION_NETWORK_MISMATCH`
**Cause:** On a node target, an account or an artifact belongs to another network than the target's (for example `simnet` against `testnet-10`). A wrong-network address would be an irrecoverable send.
**Solution:** Use an account or address of the target network, and plan again for that network.

### `WORKSPACE_NOT_FOUND`
**Cause:** A command that acts on a workspace ran where there is none: no `hardkas.config.*` at or above the directory (for example `hardkas localnet reset`, which removes a workspace's chain data and runs only inside one). Nothing is done.
**Solution:** Run `hardkas init` to create a workspace, or run the command from inside one (or pass `--workspace <path>`).

### `RPC_CONNECTION_FAILED`, `RPC_TIMEOUT`, `RPC_NOT_READY`, `RPC_INFO_UNAVAILABLE`
**Cause:** The node boundary. `RPC_CONNECTION_FAILED`: the endpoint cannot be reached (the node is down, or the port is wrong; the localnet's wRPC JSON port is 18210). `RPC_TIMEOUT`: it does not answer in time. Every command reports an unreachable node with these two codes; a connection that drops while a request is pending (the node's `WebSocket disconnected`) is `RPC_CONNECTION_FAILED` too, and for a broadcast it is an unknown outcome, never a rejection. `RPC_NOT_READY`: the node answers but is not ready (`rpc health`, `doctor node`). `RPC_INFO_UNAVAILABLE`: `rpc info` got no answer. Exit code 1.
**Solution:** Check with `hardkas rpc health` and `hardkas doctor`; start the localnet with `hardkas localnet start --toccata`, or fix the network's `rpcUrl` in `hardkas.config.ts`. For the localnet, `docker ps` and `docker logs hardkas-kaspad-toccata-v2` show the container.

### `NODE_NOT_RUNNING`
**Cause:** `hardkas doctor node` found the managed localnet container not running. Exit code 1.
**Solution:** `hardkas localnet start --toccata`.

### `RPC_SCHEMA_ERROR`
**Cause:** The node rejected the request's payload shape. `tx plan` raises it when the node rejects its UTXO request (`getUtxosByAddress`), which usually means a node of another version than HardKAS expects, or a malformed address.
**Solution:** Check the node's version with `hardkas rpc info --json` (HardKAS targets rusty-kaspad 2.1.0, the Toccata release), and the address formats you passed.

### `LOCALNET_PROFILE_REQUIRED`
**Cause:** `hardkas localnet start` was run without a profile.
**Example:** `LOCALNET_PROFILE_REQUIRED: A profile is required to start localnet. Use --profile toccata-v2 for Docker Toccata v2 simnet.`
**Solution:** Pass `--profile toccata-v2`, or its shortcut `--toccata`, to `hardkas localnet start` (`toccata-v2` is the only profile).

### `MAINNET_CONNECTION_DISABLED`
**Cause:** An operation would reach a mainnet node: a read (`rpc *`, `accounts balance`, `doctor`, `observe`), a plan (`tx plan`, `sdk.tx.plan`, a workflow's first step), a wait or status look (`tx wait`, `tx status`, `sdk.tx.observe`), a wallet (`sdk.wallet.open`, `WalletToolkit.watch`), a node set (`rpc compare`), a fork, a script or a Silver/covenant command's node. HardKAS makes no connection to mainnet at all (MAINNET TOTAL LOCKDOWN, owner decision 2026-11-09): the network asked for, the network its config entry declares (an alias such as `prod` with `network: "mainnet"`) and every spelling (`mainnet`, `mainnet-1`, `kaspa`, `kaspa-mainnet`, any case) are refused before an endpoint is even read, so nothing is contacted. An endpoint declared as another network (or a raw `--url`) whose node answers mainnet is refused right after that one identity answer (`getServerInfo`), and nothing else is asked of it; that single exchange is the one thing a client cannot avoid when an endpoint is not what it was declared to be. On an L2 client (`@hardkas/l2`) the same code refuses a mainnet profile or chain (Igra mainnet 38833), or an `eth_chainId` answer naming one.
**Example:** `MAINNET_CONNECTION_DISABLED: mainnet connections are disabled in HardKAS (the node endpoint of 'mainnet'), reads included, even to an endpoint you declare. … Nothing was contacted.`
**Solution:** None in this release: no flag, option, environment variable or configuration enables it (`allowPublic`, `experimental`, `allowMainnet`, `HARDKAS_*` have no effect). Use simnet, devnet or a testnet. Mainnet records stay verifiable offline (`hardkas artifact verify <file>` reports `INTEGRITY_VERIFIED` and the network level `NOT_CHECKED`, reason `MAINNET_NETWORK_CHECK_BLOCKED`). `hardkas doctor` reports it as its connectivity check's code (status `skip`), or, for an endpoint declared as another network whose node answers mainnet, as the network-identity check's code and the partial diagnosis' headline. `hardkas tx status` and `hardkas tx wait` fail with it as the JSON envelope's `code` (non-zero exit) when a look would read mainnet; `tx wait` ends at once instead of waiting out `--timeout`. `tx status --no-observe` takes no look and stays offline. The code is decided before the network name is resolved and before the public-network gate, so `--network kaspa|mainnet-1|kaspa-mainnet|MAINNET` and an invocation outside a workspace give it too (never `UNKNOWN_NETWORK`, `RUN_NETWORK_UNKNOWN` or `PUBLIC_NETWORK_BLOCKED`); a send gives `MAINNET_BROADCAST_DISABLED` and a signature `MAINNET_SIGNING_DISABLED` (below), and Silver commands keep `SILVERSCRIPT_MAINNET_NOT_ENABLED`, for the name and an alias that declares it alike.

### `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`
**Cause:** A signature (`tx sign`, `sdk.tx.sign`, an external signer, the accounts and PSKT signers, offline signing included) or a broadcast (`tx send`, `sdk.tx.send`, the toolkit wallet) involving mainnet in any of its identities: the artifact's network, its execution's, the instance's or what its config entry declares. Raised before any connection, any signer call and any record. The operation's own guard names the refusal: a signature is `MAINNET_SIGNING_DISABLED` and a broadcast `MAINNET_BROADCAST_DISABLED`; anything else that would reach a mainnet node is `MAINNET_CONNECTION_DISABLED` (above). On L2, an Igra mainnet write is `L2_MAINNET_WRITE_BLOCKED`, whatever `allowMainnet` / `--allow-mainnet` say.
A Toccata ZK spend is refused as a signature too: `buildR0Groth16Transaction` and `buildR0Groth16Plan` (`sdk.zk.toccata.buildTransaction` / `buildPlan`) with a mainnet `networkId` (any spelling) throw `MAINNET_SIGNING_DISABLED` before the scripts or the UTXO are read. A ZK spend carries no signature: its signature script (journal hash, proof, redeem script) is the authorization, so the transaction those functions build is complete and any tool could broadcast it. Until the crypto review's H5 they built it and only warned (`ZK_MAINNET_BUILD_UNGUARDED`, removed).
The CLI commands that make a key or a lock refuse mainnet with `MAINNET_SIGNING_DISABLED` too, before any key exists: `accounts real generate` and `accounts real import`, `kaspa wallet create` (with or without `--show-private-key`) and `zk toccata build-scripts --address-network`, for every spelling of mainnet (and, for the account and wallet commands, every config alias that declares it).
**Solution:** None in this release. HardKAS produces no signed mainnet transaction, and no complete mainnet ZK spend.

### `MAINNET_CONFIRMATION_REQUIRED`, `PLAINTEXT_MAINNET_FORBIDDEN`
**Cause:** Permanent mainnet rules (`core/src/mainnet-policy.ts`) that do not depend on the lockdown and are checked after it, so while mainnet is locked down the lockdown codes above come first. `MAINNET_CONFIRMATION_REQUIRED`: `tx send` on mainnet with `--yes`, or with stdin that is not a terminal; a mainnet transaction needs a human's interactive confirmation, never an agent's or a script's. `PLAINTEXT_MAINNET_FORBIDDEN`: `accounts real generate --unsafe-plaintext` for a mainnet network (any spelling, or a config alias that declares it), or `accounts real import --unsafe-plaintext` of a mainnet address; nothing is generated or imported. `@hardkas/core` also exports the same rule as `assertMainnetNoPlaintext`.
**Solution:** None while mainnet is locked down.

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
**Cause:** A lock time was asked where HardKAS still builds with lock time 0: on the simulator (its lock-time rule is its own and unverified) and in consolidations (`amount: "all"`). Absolute lock times are supported elsewhere (see `LOCK_TIME_INVALID`). Nothing is planned or signed.
**Solution:** Use a Kaspa node network, or a payment instead of a consolidation.

### `LOCK_TIME_INVALID`, `LOCK_TIME_NOT_REACHED`, `LOCK_TIME_UNVERIFIABLE`, `LOCK_TIME_VOID_SEQUENCE`, `LOCK_TIME_DISTANT_UNCONFIRMED`, `LOCK_TIME_OPTION_SHORTCUT_ONLY`, `LOCK_TIME_NOT_APPLIED`
**Cause:** Absolute lock times (CLTV): `tx.plan({ lockTime: { daaScore } | { timestampMs } })`, `hardkas tx plan` and `hardkas tx send` with `--lock-time-daa` or `--lock-time-ms`, SilverScript spends with a lock time. A plan records its lock time, the signer writes it with inputs at sequence 0 so that it is enforced, and a signed lock time must equal the one its plan authorizes (`SIGNED_PLAN_MISMATCH`).
- `LOCK_TIME_INVALID`: not a typed value (a bare number, both or neither kind, a DAA score at or above 500,000,000,000, which Kaspa reads as a time, a time below it, 0, not a u64), or both CLI options. Nothing is read, planned or signed.
- `LOCK_TIME_NOT_REACHED`: the send preflight: the node has not passed the lock yet (a DAA-score lock needs the virtual DAA score strictly above it, a time lock the past median time strictly above it; equal is not final). The node would refuse it, and that refusal would be the transaction's one recorded submission, so nothing is sent or recorded: the same signed transaction can be sent once the lock is reached. Metadata: `lockTime`, `kind`, `reference`, `remaining`.
- `LOCK_TIME_UNVERIFIABLE`: the node did not report the DAA score or median time the lock is compared with. Nothing is sent.
- `LOCK_TIME_VOID_SEQUENCE`: a lock time with an input at the maximum sequence, which makes the input final and the lock void. Nothing is signed.
- `LOCK_TIME_DISTANT_UNCONFIRMED`: CLI: the lock is more than about a day past the node's position (864,000 DAA at 10 DAA per second, or 86,400,000 ms), or its distance cannot be measured. A DAA score taken for a time, or computed at another network's rate, locks the funds far longer than meant. Nothing is planned.
- `LOCK_TIME_OPTION_SHORTCUT_ONLY`: `tx send <signed>` with a lock-time option: a signed transaction carries its plan's lock time.
- `LOCK_TIME_NOT_APPLIED`: internal guard: kaspa-wasm did not keep the plan's lock time.
**Solution:** Give one typed lock time on a Kaspa node network, keep the inputs' sequence below the maximum, and send once the node passes it. For a distant lock, check the value, then pass `--confirm-distant-lock-time`.

### `ECDSA_SPEND_NOT_SUPPORTED`
**Cause:** A spend from an ECDSA P2PK address (version 1, script `21 <33-byte key> ab`) where HardKAS still signs Schnorr only: on the simulator, in consolidations and in v1 transactions. Payments from ECDSA accounts are supported (`accounts real generate|import --ecdsa`). Nothing is planned or signed.
**Solution:** Pay with a v0 payment from the ECDSA account, or spend from a Schnorr address.

### `INPUT_KEY_SCHEME_MISMATCH`, `ACCOUNT_KEY_SCHEME_MISMATCH`, `ACCOUNT_KEY_SCHEME_INVALID`, `UTXO_ENTRY_MISSING`
**Cause:** ECDSA accounts and inputs. `INPUT_KEY_SCHEME_MISMATCH`: the key or signer of an input is of the other scheme than its UTXO script (a Schnorr key on an ECDSA input, or the reverse). `ACCOUNT_KEY_SCHEME_MISMATCH`: an account's recorded key scheme and its address disagree; at import, `--address` is the key's address under the other scheme. `ACCOUNT_KEY_SCHEME_INVALID`: a scheme other than `schnorr` or `ecdsa`. `UTXO_ENTRY_MISSING`: an ECDSA signer got an input without its UTXO entry. `PRIVATE_KEY_DOES_NOT_CONTROL_INPUT` is also raised for an ECDSA key that is not the one the input's script commits to. Nothing is signed.
**Solution:** Import the key with `--ecdsa` when its address is the ECDSA one, and spend each input with its own scheme's key.

### `TOO_MANY_OUTPUTS`
**Cause:** A payment to several recipients in one transaction (`sdk.tx.plan({ outputs })`, `tx plan --to <recipient>=<kas>` repeated, `tx batch --one-transaction`) has more outputs than the transaction planner (the pinned kaspa-wasm Generator) puts in one standard transaction beside its change output; the outputs, the change and the payload must leave room for the inputs. The message, and `outputsThatFit` / `requestedOutputs` on the SDK error, say how many of the first recipients fit, counted by the same Generator: about 193 ordinary (P2PK) recipients, fewer to P2SH addresses. Nothing is planned, signed or sent.
**Solution:** Pay the others in another transaction, or run `tx batch` without `--one-transaction` (one transaction per payment).

### `TX_PLAN_RECIPIENTS_CONFLICT`, `TX_PLAN_RECIPIENTS_INVALID`
**Cause:** `sdk.tx.plan` takes one recipient (`to` and `amount`) or several in one transaction (`outputs: [{ to, amount }, …]`). `TX_PLAN_RECIPIENTS_CONFLICT`: both forms were given. `TX_PLAN_RECIPIENTS_INVALID`: neither form; or `outputs` is not a non-empty list of `{ to, amount }`; or a recipient has no account or address, an amount that is not a string (KAS), a bigint (sompi) or a number (KAS), an amount of 0 or less, or `"all"` (a consolidation pays one destination: `{ to, amount: "all" }`). Nothing is read or planned.
**Solution:** Give one of the two forms.

### `TX_BATCH_MULTIPLE_PAYERS`, `TX_BATCH_PAYMENT_INVALID`, `TX_BATCH_EMPTY`
**Cause:** `tx batch --one-transaction` pays the whole file in one transaction, so it has one payer and every payment must be complete. `TX_BATCH_MULTIPLE_PAYERS`: the file pays from more than one payer (compared by the address each `from` resolves to). `TX_BATCH_PAYMENT_INVALID`: a payment has no `from`, `to` or `amount` (the message names its index); without the flag such a payment is skipped and reported, as before. `TX_BATCH_EMPTY`: the file has no payments. Nothing is planned, signed or sent (exit 2). In the file, an `amount` is in KAS; write it as a string (`"10.5"`). A JSON number is read by its literal, exactly as written (`10.5` is 10.5 KAS), not through a floating-point value.
**Solution:** Split the file per payer, complete the payment, or run the batch without `--one-transaction` (one transaction per payment).

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

### `ZK_VERIFY_SCRIPTS_INPUT_CONFLICT`, `ZK_VERIFY_SCRIPTS_INPUT_REQUIRED`, `ZK_VERIFY_SCRIPTS_RECORD_INVALID`, `ZK_SCRIPTS_RECORD_P2SH_MISMATCH`, `ZK_SCRIPTS_RECORD_ADDRESS_MISMATCH`
**Cause:** `hardkas zk toccata verify-scripts` takes the lock from one place: its record (`--scripts <record>`, the JSON `zk toccata build-scripts --json` prints, as `zk toccata spend --scripts` takes it) or the hex pair (`--redeem-script <hex>` with `--sig-script <hex>`).
- `ZK_VERIFY_SCRIPTS_INPUT_CONFLICT`: `--scripts` together with `--redeem-script` or `--sig-script`. `ZK_VERIFY_SCRIPTS_INPUT_REQUIRED`: neither the record nor both hex scripts. `ZK_VERIFY_SCRIPTS_RECORD_INVALID`: the record is not a readable, successful `hardkas.zkToccataScripts.v1` record, or one of its amounts is not an amount. These three are usage errors (exit 2): nothing is verified.
- A record's scripts are verified against what the record claims (image id, journal hash, binding mode and, output-bound, its payout and change) and against any `--image-id`, `--journal-hash` or `--expected-*` given. The record must also be its redeem script's: `ZK_SCRIPTS_RECORD_P2SH_MISMATCH` when its `p2shScriptPublicKey` is not the P2SH script of its redeem script, `ZK_SCRIPTS_RECORD_ADDRESS_MISMATCH` when an address it carries (simnet, testnet-10) is not that script's address on that network. They are reported as issues of a result with `ok: false`; funding such an address would not lock to these scripts.
**Solution:** Pass the record alone, or the two hex scripts alone. Do not fund a record whose P2SH script or address does not match: build the lock again with `zk toccata build-scripts`.

### `ZK_REDEEM_SCRIPT_NOT_CANONICAL`, `ZK_EXPECTED_BINDING_NOT_ENFORCED`
**Cause:** `verify-scripts` rebuilds the redeem script from the parameters it carries (the image id of its first push; in output-bound mode the payout, the change and the input limit) with the builders `build-scripts` uses, and compares the bytes. `ZK_REDEEM_SCRIPT_NOT_CANONICAL`: they differ (the message says where the reading stopped), so `consensusEnforced` is `false` and no `enforces*` / `bound*` field is set: nothing is inferred from the presence of introspection opcodes (before the crypto review's H2 a count pushed and dropped, or a change never compared, passed). `ZK_EXPECTED_BINDING_NOT_ENFORCED`: expected outputs (`--expected-payout-*`, `--expected-change-*`) were given for a script that is not such an output-bound lock, for example a proof-only lock, which binds no output.
**Solution:** Use a lock built by `build-scripts`, or review the foreign script by hand: HardKAS makes no claim about it.

### `ZK_BOUND_PAYOUT_SPK_MISMATCH`, `ZK_BOUND_PAYOUT_AMOUNT_MISMATCH`, `ZK_BOUND_CHANGE_SPK_MISMATCH`, `ZK_BOUND_CHANGE_AMOUNT_MISMATCH`, `ZK_BOUND_CHANGE_MISSING`
**Cause:** A canonical output-bound lock binds another payout or change (output 1) than the one expected (`--expected-payout-address|amount`, `--expected-change-address|amount`; SDK `expectedPayout*` / `expectedChange*`), or binds no change when one was expected. The bound values are in `boundPayoutSpk`, `boundPayoutAmount`, `boundChangeSpk`, `boundChangeAmount` and `boundMaxInputSompi`.
**Solution:** Check the lock's outputs before funding it; the redeem script, not the expectation, decides where the funds can go.

### `ZK_BOUND_OUTPUT_STORAGE_MASS_ABOVE_LIMIT`
**Cause:** `hardkas zk toccata build-scripts --mode proof-and-output-bound` / `buildR0Groth16Scripts`, and `verify-scripts` / `verifyR0Groth16Scripts`. The spend of the lock would have a storage mass (KIP-9: C/output − C/input, C = 10¹²) above 500,000 g, the limit a rusty-kaspad 2.1.0 node and every block apply. A small bound output (payout or change) causes it. No fee lowers it, and a lock's outputs cannot change once it is funded, so a funded lock would stay locked for ever. `build-scripts` measures the spend funded with the amount it asks for and returns nothing to fund (no script, no address); the message and `minimumBoundAmountsSompi` name the smallest payout and change that fit (with the default fee, about 0.0183 KAS for a payout alone). `verify-scripts` raises it for a canonical lock whose cheapest possible spend is above the limit.
**Solution:** Bind a larger payout or change. Do not fund a lock `verify-scripts` refuses with this code.

### `ZK_TX_EXCEEDS_BLOCK_STORAGE_MASS_LIMIT`
**Cause:** `buildR0Groth16Transaction`: the spend's storage mass is above 500,000 g, so no node relays it and no block can include it (the node says "transaction storage mass of N is larger than max allowed size of 500000"). Proof-only: what is left after the fee is too small for that UTXO. Output-bound: storage mass grows with the input, so an over-funded UTXO of a lock with a small output can pass the limit while a smaller one fits; the message names the UTXO range that fits, or says no spend of the lock can ever be included.
**Solution:** Proof-only: spend a larger UTXO or pay a smaller fee. Output-bound: spend a UTXO in the range named.

### `ZK_BOUND_LOCK_OVERFUNDING_UNSPENDABLE` (warning)
**Cause:** `buildR0Groth16Scripts`: the lock is spendable when funded with exactly `requiredFundingSompi`, but a UTXO above the amount named (still within the lock's input limit) would have a storage mass above 500,000 g and could never be spent.
**Solution:** Fund exactly the amount asked for.

### `ARTIFACT_HASH_MISMATCH`
**Cause:** The artifact's content no longer hashes to the `contentHash` it carries: it was edited after it was sealed. `tx sign`, `tx send` and `artifact verify` (CLI), and `sdk.tx.sign`, `sdk.tx.send` and `sdk.artifacts.verify(..., { throwOnInvalid: true })` (SDK) refuse it with this code before anything is signed, sent or contacted.
**Solution:** Use the artifact as it was written, or produce a new one from the last intact step (`tx plan`, `tx sign`). Do not delete it at once: it may be the only copy of a signed transaction. If it was never submitted, regenerate it; if it was submitted, keep it as a record, never edit hashes by hand, and follow the transaction by its txId (`hardkas tx status <txId>`).

### `NO_SPENDABLE_UTXOS`
**Cause:** The sender has nothing to spend: no UTXOs, or only coinbase outputs that are not mature yet (the message says how many were left out as immature). The CLI's `tx plan` and the SDK's planner (`sdk.tx.plan`) raise the same code.
**Solution:** Fund the address, or wait until its coinbase outputs pass the network's coinbase maturity (1,000 DAA on simnet).

### `INSUFFICIENT_FUNDS_UPSTREAM`
**Cause:** The spendable UTXOs (mature, unspent, not held by a pending spend of this workspace) do not cover the amount plus the network fee.
**Solution:** Lower the amount or fund the account. Check with `hardkas accounts balance <account> --network <network>` and `hardkas rpc utxos <address>`.

### `MULTI_TRANSACTION_PLAN_REQUIRED`
**Cause:** The inputs the payment needs do not fit in one standard transaction: the planner (kaspa-wasm's Generator) would split it into several, and HardKAS plans one transaction at a time. Usually a mining or test wallet with many small UTXOs.
**Solution:** Consolidate first, then plan again: `hardkas accounts consolidate <account> --network <network> --execute --yes`. If the consolidation itself reports it, use a smaller `--batch-size`.

### `SELECTED_UTXO_INVALIDATED`
**Cause:** CLI planning against a node: in every bounded retry, an input the planner selected was no longer in the address's UTXO set, or was being spent by a transaction in the node's mempool. The DAG advancing while the plan is built is never a reason for it. SDK: `SelectedUtxoInvalidatedError`.
**Solution:** Wait for the competing transaction to be accepted or dropped (`hardkas tx wait <txId>`), then plan again.

### `COINBASE_MATURITY_UNRESOLVED`
**Cause:** The network's coinbase maturity could not be resolved. HardKAS reads it from the pinned Kaspa SDK, which has no parameters for that network (for example the retired `testnet-11`), and the config gives no `consensusParams.coinbaseMaturity` override. Immature coinbase outputs themselves are simply left out of planning.
**Solution:** Use a network the Kaspa SDK knows, or set `consensusParams.coinbaseMaturity` for that network in the workspace config.

### `DOCTOR_NETWORK_REQUIRED`, `DOCTOR_FLOW_INVALID`, `DOCTOR_TIMEOUT_INVALID`
**Cause:** Usage errors of `hardkas doctor`'s node options, raised before anything runs: `--url` with no network for the node to prove (the workspace runs on the simulator, or there is none); a `--flow` other than `payment`, `silver`, `covenant`; a `--timeout` outside 100–120000 ms.
**Solution:** Pass `--network <name>` with `--url`; fix the option. The node checks' own codes (`NODE_REACHABLE`, `NODE_UNREACHABLE`, `NODE_TIMEOUT`, `NODE_NETWORK_MISMATCH`, `NODE_IS_SIMULATOR`, `NODE_VERSION_UNEXPECTED`, `NODE_NOT_SYNCED`, `MAINNET_CONNECTION_DISABLED` (it was `MAINNET_NOT_CONTACTED`), `PUBLIC_NETWORK_BLOCKED`, `NO_NODE_CONFIGURED`, `FLOW_READY`, …) are in the report's `checks[].code`, not errors.

### `TX_SEND_CONFIRMATION_REQUIRED`
**Cause:** A command that broadcasts was run without `--yes` on a network other than the simulator or simnet (a testnet, or a node endpoint). Every broadcasting command asks for it: `tx send`, `tx batch`, `wallet hd send`, `escrow fund`, `escrow release`, `escrow rescue-v1 broadcast`, `kcc20 deploy`, `kcc20 transfer`, `silver deploy`, `silver spend`, `silver covenant genesis|transition|start|advance` and `silver test --on-node`. `accounts consolidate --execute` needs `--yes` on every network, simnet included. The refusal comes before anything is read, planned, signed, broadcast or written. Exit code 3 (policy denied); with `--json` the envelope has `outcome: "not_executed"` and the command to run (`nextSteps`). Mainnet is refused before this, by each command's own lockdown guard, whatever `--yes` says.
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
**Solution:** Run the wait again to continue from where it stopped, or pass `--since <a chain block hash before its acceptance>`, or `--address <an address it pays>`. On a localnet, check that the miner is running.

### `TX_WAIT_FAILED`
**Cause:** `tx wait`: the transaction's derived state can no longer reach the target (`REJECTED_BY_NODE`, or `CONFLICTING_OBSERVATIONS`); the message names the state and its reasons. `tx send --wait` reports a failed wait with it too when nothing more precise is known. Exit code 1.
**Solution:** Read the state with `hardkas tx status <txId>`. A transaction the node rejected is never sent again (one submission per txId): plan a new payment.

### `TX_SEND_WAIT_FAILED`
**Cause:** `tx send --wait` submitted the transaction to the node (`outcome: "submitted"`), so a `txId` exists on the network, but waiting for `CONFIRMED` failed or exceeded `--wait-timeout` (default 60 s).
**Solution:** Do **not** blindly resend. Inspect or continue waiting on the same transaction: `hardkas tx wait <txId> --until confirmed --network simnet --url <ws://...>`.

### `SILVER_SUCCESSOR_STATE_UNCHANGED`
**Cause:** `silver covenant transition` compiles the successor state and compares its state bytes against the current state; both compiled to the exact same bytes (for example, advancing with `delta = 0` while keeping `--next-state` unchanged). HardKAS rejects no-op state transitions locally before broadcast.
**Solution:** Pass a `--next-state` that differs from the current state (or, for an intentional negative node-consensus test, supply a distinct `--next-state` that violates the SilverScript `require(...)` predicate).

### `SILVER_SUCCESSOR_TEMPLATE_CHANGED`
**Cause:** Recompiling the SilverScript contract with the successor state altered bytecode outside the declared `state_span` (template hash, prefix, suffix, or entry ABI), meaning the `--state-map` does not hold for this contract.
**Solution:** Verify the `--state-map` constructor index mapping against the contract's constructor parameters and state fields.

### `TX_WAIT_UTXO_VIEW_STALE`
**Cause:** `tx wait --address` reached the requested state from the node's chain, but the node's UTXO index does not show it yet at the addresses given: no output of the transaction is listed there, and nothing accepted at or after its accepting block is listed either. The index may trail the chain, or the transaction's outputs there were spent since by a transaction that pays elsewhere. Balances read from the node now could be stale.
An address whose UTXO list is too large to read (`RPC_RESPONSE_TOO_LARGE`, below) never causes it on its own: `tx wait` reads such an address once, lists it in `utxoView.tooLargeToRead` and checks the view on the readable addresses only.
**Solution:** Wait again with a larger `--timeout`, or pass an address where something newer is listed (for example the change address of a later payment).

### `REPLAY_MODE_UNSUPPORTED`
**Cause:** `hardkas replay verify` / `sdk.replay.verify` was given a real-node send or a node plan. A send to a Kaspa node records a `TxSubmission`, not a `TxReceipt`, and HardKAS cannot rebuild a live network's history from local artifacts, so it fails closed. Replay re-executes simulator runs only. Nothing was executed.
**Solution:** Check a real send with `hardkas verify <submission>` and `hardkas tx status <txId>`.

### `REPLAY_DIVERGED`, `REPLAY_INPUT_INVALID`, `REPLAY_LEGACY_AUTH_SCOPE`, `ARTIFACT_INPUT_IS_DIRECTORY`
**Cause:** `hardkas replay verify <receipt>` (one simulator receipt, by artifactId or path). Exit code 1.
- `REPLAY_DIVERGED`: the re-execution produced another outcome than the receipt recorded.
- `REPLAY_INPUT_INVALID`: an artifact of the receipt's lineage does not pass integrity (or the receipt's txId is not a transaction id); nothing is executed and no report is written.
- `REPLAY_LEGACY_AUTH_SCOPE`: the receipt declares a legacy hash version whose fields were never authenticated; no verdict is given.
- `ARTIFACT_INPUT_IS_DIRECTORY`: a directory was given instead of one receipt.
**Solution:** For a divergence, inspect the report (`hardkas replay verify <receipt> --json`) and check what changed since the run: the simulator state (`.hardkas/localnet.json`), the network parameters, the toolchain. Editing artifacts never fixes it. Re-issue a legacy receipt with `hardkas artifact migrate <path> --to 5`. See [Replay Verification](../guides/replay-verification.md).

### `VERIFICATION_FAILED`, `VERIFICATION_LEVEL_NOT_REACHED`, `NAMESPACE_REQUIRED`
**Cause:** Evidence commands.
- `VERIFICATION_FAILED`: `artifact verify --json` (or `verify --json`) found an artifact that does not verify: schema, content hash or lineage. Exit code 1.
- `VERIFICATION_LEVEL_NOT_REACHED`: the artifact verifies, but below the level `--require` asked for (`network`, `consensus`). Exit code 1.
- `NAMESPACE_REQUIRED`: `explain`, `why` or a lookup was given something that is neither a workspace path nor a 64-hex artifactId, such as a plan label or a simulator txId. The message names the option to use (`--plan`, `--signed`, `--tx`, `--workflow`).
**Solution:** See [Artifact Auditing](../guides/artifact-auditing.md). For a transaction, use `hardkas explain --tx <txId>`.

### `NODE_IMAGE_DIGEST_REQUIRED`
**Cause:** `HARDKAS_KASPAD_IMAGE` (or the deprecated `node start --image`) names a node image by tag only (for example `kaspanet/rusty-kaspad:latest`). A tag can be moved; only a digest names the image that was validated. Refused before Docker is asked to run anything, by the node runner (`localnet start`, `sdk.node.start`, and the hidden, deprecated `hardkas node start`, `hardkas node restart` and `hardkas node reset`: use `hardkas localnet`) and the simnet test harness.
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

### `LOCALNET_RESET_OTHER_WORKSPACE`, `LOCALNET_RESET_DATA_UNVERIFIED`
**Cause:** `hardkas localnet reset [--yes] [--wait-lock] [--lock-timeout <ms>] [--json]` starts the localnet over from an empty chain: it stops the toccata-v2 node and its miner, checks that each is down, then removes only this workspace's chain data (`.hardkas/kaspad`). It keeps the dev accounts and their keys, and the workspace's artifacts and records. There is one localnet per machine, so before anything is stopped or removed it reads from Docker where the running node keeps its chain:
- `LOCALNET_RESET_OTHER_WORKSPACE`: the running node keeps its chain data in another workspace (that workspace started it).
- `LOCALNET_RESET_DATA_UNVERIFIED`: the node is running, but Docker names no folder for its chain data, so whose chain it is cannot be told.

Both are usage errors (exit 2), and nothing was stopped or removed. Without `--yes` the command asks for confirmation; `--json` needs `--yes` (`INTERACTIVE_PROMPT_IN_JSON_MODE` otherwise), and outside a workspace it is `WORKSPACE_NOT_FOUND`. A node or miner that does not stop is `LOCALNET_STOP_FAILED`, and then the chain data is not removed.
**Solution:** Run `hardkas localnet reset` in the workspace that started the node, or stop the localnet first (`hardkas localnet stop`) to reset only this workspace's data. Then `hardkas localnet start --toccata` makes a fresh chain.

### `KEYSTORE_PASSWORD_REQUIRED`
**Cause:** An encrypted keystore account must be opened (to sign, export or change its password) and no password was given. A prompt is offered only on a terminal, for commands that allow one. Nothing is written. Exit code 2.
**Solution:** Pass the password with `--password-env <VAR>` or `--password-stdin` (SDK: `keystorePassword`).

### `ACCOUNT_NAME_TAKEN`
**Cause:** `accounts real generate` or `accounts real import` was given a name that already exists in the workspace, in `.hardkas/accounts.real.json` or `.hardkas/keystore/` (case-insensitive). Nothing is created or overwritten. Exit code 2.
**Solution:** Choose another `--name`.

### `ACCOUNT_ADDRESS_KEY_MISMATCH`, `INVALID_PRIVATE_KEY_MATERIAL`
**Cause:** `accounts real import`: the `--address` given is not the address of the imported key on its network, so the account could never sign for it (the message gives the key's real address); or the key is not a 32-byte key (64 hex characters). Nothing is imported. Exit code 2. A simulator identity (`kaspa:sim_…`) is not checked.
**Solution:** Pass the key's own address, or omit `--address`.

The signer raises `INVALID_PRIVATE_KEY_MATERIAL` too when the key it is handed is not a 64-character hex string: a script passed a password, a malformed hex string or a serialized object where key material was expected. Check the keystore path and what the script hands the signer.

### `CORRUPTED_PRIVATE_KEY_SERIALIZATION`, `DEV_ACCOUNT_KEY_UNAVAILABLE`
**Cause:** `CORRUPTED_PRIVATE_KEY_SERIALIZATION`: a stored account's key is an object, `[object Object]`, or carries a WASM pointer (`__wbg_ptr`): a runtime key object was serialized instead of portable data, so the key was never recoverably stored. `DEV_ACCOUNT_KEY_UNAVAILABLE`: HardKAS tried to sign for a development account and the workspace has no key for it, or its development keystore does not open.
**Solution:** Regenerate the corrupted account; never serialize raw Kaspa WASM classes (export the encrypted keystore JSON or primitive key data, and recreate key objects inside the signing process). For a development account, initialize or check the workspace: `hardkas init`, then `hardkas doctor workspace`.

A related symptom has no code: a Node.js or browser process that crashes with a WebAssembly memory error ("memory access out of bounds") while signing usually received a raw Kaspa WASM object across a process, thread or browser/Node boundary. Pass only portable data across boundaries; a browser app talks to the dev server over HTTP instead of importing the Node SDK.

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

`OUTPUT_BELOW_STANDARD_AMOUNT` is the payment's side of the same rule: the payment output itself is too small for a standard output from the selected UTXOs (storage mass, KIP-9). Send a larger amount.

The same code (or `OUTPUT_BELOW_STANDARD_AMOUNT`, when the script output itself is the small one) comes from a SilverScript v0 funding (`silver deploy`, the dev server's escrow funding): the change is so small that the transaction's storage mass would pass the node's limit of 500,000 g. The remainder is never paid to the miner.

### `FEE_BELOW_NETWORK_MINIMUM`, `ESCROW_FEE_BELOW_MINIMUM`, `ESCROW_FEE_BUDGET_BELOW_MINIMUM`
**Cause:** A SilverScript v0 spend or funding, a covenant genesis or transition, an escrow release or `escrow rescue-v1 prepare --fee` pays less than the node's minimum relay fee. The node's minimum is 100 sompi per gram of the transaction's compute mass (or of its normalized transient mass, when larger); storage mass has no fee floor and is limited separately to 500,000 g. Both rules were checked against a rusty-kaspad 2.1.0 node, for transaction versions 0 and 1. The message names the minimum. `ESCROW_FEE_BUDGET_BELOW_MINIMUM` comes from the dev server's `POST /api/escrows/:id/fund` (HTTP 400): an escrow contract fixes its release outputs, so the fee of every release is the escrow's `feeBudgetSompi` (default 2,000,000). Every branch is drafted before anything is read from the node, signed or sent, and a budget below the node's minimum for one of them would leave the escrow funded and impossible to release, so it is not funded.
**Solution:** Pay at least the minimum named. For an escrow, create it again with a `feeBudgetSompi` of at least that minimum.

### `SILVER_SIG_OPS_ABOVE_STANDARD`
**Cause:** `hardkas silver deploy` or `hardkas silver covenant genesis` was given a contract whose redeem script counts more than 15 signature operations. A node's mempool counts them over the whole redeem script (every entry, every inlined helper call site, every unrolled loop iteration), whatever entry a spend runs, and refuses every spend of such a P2SH input as non-standard ("transaction input #0 has 16 signature operations which is more than the allowed max amount of 15"), for transaction versions 0 and 1. Checked against a rusty-kaspad 2.1.0 node. The check runs before any key is read, any node is contacted or anything is funded. Exit code 2. There is no override: every HardKAS spend goes through a node's mempool.
**Solution:** Bring the contract to 15 signature checks or fewer, for example by splitting it into several contracts. `silver audit` reports the count (`COV-SIGOPS-001`).

### Node rejection classes `SCRIPT_LOCK_UNSATISFIED`, `STORAGE_MASS_ABOVE_LIMIT`
**Cause:** How HardKAS classifies a node's refusal (`classifyNodeRejection` in `@hardkas/artifacts`, the `rejection.code` of a send result, and a `[CODE: hint]` suffix on `SILVER_REJECTED_BY_NODE`).
- `SCRIPT_LOCK_UNSATISFIED`: the redeem script's own time-lock check (CheckSequenceVerify or CheckLockTimeVerify; node text "Unsatisfied lock time: locktime requirement not satisfied -- 500 > 0") failed against a field of the transaction. For CheckSequenceVerify it is the input's sequence; for CheckLockTimeVerify, the transaction's lock time. Waiting never helps: the same transaction never passes. It was classified `LOCK_TIME_REJECTED`, which now means only the finality refusal "transaction input #N is not finalized". Carries `lockRequired` and `lockDeclared` when the text has them.
- `STORAGE_MASS_ABOVE_LIMIT`: "transaction storage mass of N is larger than max allowed size of 500000". The storage mass (KIP-9, about 10¹² divided by each output's amount, so a small output dominates) is above the node's limit. Carries `storageMass` and `storageMassLimit`.

**Solution:** `SCRIPT_LOCK_UNSATISFIED`: build the spend again with the field the lock needs, at least the first number of the text: `silver spend --sequence` for a relative lock, `--lock-time-daa` or `--lock-time-ms` for an absolute one.

### `LOCK_TIME_KIND_MISMATCH`, `LOCK_TIME_BELOW_ENTRY_REQUIREMENT`
**Cause:** HardKAS reads a SilverScript entry's top-level `require(tx.daa >= x)` / `require(tx.time >= t)` (and a covenant leader's policy) before planning or signing (`sdk.covenants.planContractSpend`, `planTransition`, `hardkas silver spend`). `LOCK_TIME_KIND_MISMATCH`: the entry needs a DAA-score lock and the spend gives a time, or the reverse (lock time 0 counts as a DAA score); silverc compiles the kind into the script and the node refuses a mismatch whatever the time. `LOCK_TIME_BELOW_ENTRY_REQUIREMENT`: the entry's x is known (a literal, or a constructor or entry argument HardKAS has; on transaction v0 the constructor values are not known) and the lock time is below it. Nothing is planned or signed. Exit code 2. Conditional, looped or helper statements and delegate entries are not read: the node judges them.
**Solution:** Give a lock time of the kind the entry checks (`--lock-time-daa` or `--lock-time-ms`), at least x. `STORAGE_MASS_ABOVE_LIMIT`: raise the smallest output or merge it into another, and build a new transaction.

### `NETWORK_ADDRESS_MISMATCH`
**Cause:** An address belongs to another Kaspa network than the one the command uses (its prefix: `kaspa:`, `kaspatest:`, `kaspasim:`, `kaspadev:`), or a simulator identity (`kaspa:sim_…`) is used on a real network: for example a `kaspatest:` address given to a simnet command (`hardkas tx plan --from <account> --to kaspatest:<address> --amount 1 --network simnet`), or an artifact edited by hand. Account import refuses it too, and artifact verification reports it when an artifact's address does not fit its `networkId`.

In SilverScript spends: `hardkas silver spend --to` (`buildSilverSweep`), a spend draft output given by address (`prepareSilverSpend`) or `hardkas escrow rescue-v1 prepare --to` naming an address of another network. The value would go to the same key's script on the spend's network while the record named a foreign address. Nothing is signed or written. The rescue checks it after the node has proved its identity, so the mainnet and identity refusals come first (exit 2).
**Solution:** Give an address of the command's network, and plan again for the intended network instead of editing an artifact by hand. A mainnet command never gets this far: mainnet is refused first (`MAINNET_CONNECTION_DISABLED`, `MAINNET_BROADCAST_DISABLED`).

### `PSKT_SIGNER_NETWORK_REQUIRED`, `PSKT_NETWORK_MISMATCH`, `PSKT_INPUTS_UNVERIFIED`, `PSKT_INPUT_NOT_ON_NETWORK`
No PSKT operation works in this build (`hardkas pskt` is hidden; its export, import, sign, merge, finalize and extract refuse, and the SDK's default adapter implements none). The network checks of this entry still run before the adapter refuses; the read-back and extract codes below describe the native adapter (`@hardkas/pskt-native`, unpublished and on hold).

**Cause:** `pskt sign` / `pskt.signSession`. A PSKT session's `networkId` is only what its author wrote, and a Kaspa signature does not commit to a network, so HardKAS signs only for the network the signer names, and only inputs that network's node lists as unspent. These checks run after the mainnet refusal and before the key file is read.
- `PSKT_SIGNER_NETWORK_REQUIRED` (exit 2): no signer network was given (`--network`, the workspace config's network, SDK `context.networkId`).
- `PSKT_NETWORK_MISMATCH` (exit 3): the session declares another network than the signer's.
- `PSKT_INPUTS_UNVERIFIED` (exit 1): the inputs could not be checked: no node is configured for that network (the simulator, or a testnet without `networks[<name>].rpcUrl`), the node could not be asked, or the payload's inputs cannot be read.
- `PSKT_INPUT_NOT_ON_NETWORK` (exit 1): the node does not list an input to be signed as unspent. It may be spent or not yet accepted, or an output of another network, mainnet included, where a signature would be valid.

Nothing is signed.
**Solution:** Sign in a workspace of the session's network, with that network's node declared (`rpcUrl`).

### `PSKT_SIGNATURE_MISSING`, `PSKT_SIGNED_TRANSACTION_CHANGED`, `PSKT_SIGNED_PAYLOAD_UNREADABLE`
**Cause:** `pskt sign` / `pskt.signSession` read back what the signer returned before recording it. Nothing is recorded and the session is unchanged.
- `PSKT_SIGNATURE_MISSING`: an input the caller asked to sign came back without a 64-byte Schnorr signature by the signer's key (a wallet has been seen returning an empty one without an error). A transaction finalized from it would be refused.
- `PSKT_SIGNED_TRANSACTION_CHANGED`: what came back is not the transaction that was sent: another number of PSKTs, inputs or outputs; another outpoint, UTXO entry, sequence, minimum time, sighash type, signature-operation count or redeem script on an input; another amount, script or covenant on an output; another version, lock time or payload; or partial signatures removed, changed, or added on an input not asked for. Values are compared as written (u64 values without loss; an absent field equals null).
- `PSKT_SIGNED_PAYLOAD_UNREADABLE`: the payload sent or returned is not a PSKB bundle HardKAS can read (`pskt-binary-base64`), so the two cannot be compared.

**Solution:** Use a signer that signs the inputs asked for and returns the same transaction. Do not combine or finalize the payload it returned.

### `PSKT_EXTRACTED_INPUT_UNSIGNED`
**Cause:** `pskt extract` / `pskt.extractSession` (native adapter): the extracted transaction has an empty or non-hex signature script on the inputs listed in `metadata.inputs`. It is unsigned there and a node would refuse it. Nothing is returned.
**Solution:** Collect the missing signatures, then finalize and extract again.

### `DEPLOY_INIT_FILE_EXISTS`
**Cause:** `hardkas deploy init` would overwrite profile files already in the directory (`docker-compose.yml`, `Dockerfile`, `.env.example`, `PRODUCTION_CHECKLIST.md`). Every target is checked before anything is written. Exit code 2.
**Solution:** Move the files aside, or pass `--force`.

### `RPC_DOCTOR_NOT_READY`
**Cause:** `hardkas rpc doctor` found at least one requested endpoint not ready: unreachable, a protocol or RPC error, or refused as mainnet (`REFUSED: MAINNET_CONNECTION_DISABLED` in the report). The report names each one. Exit code 1.
**Solution:** Fix or remove the endpoint the report names. Endpoints are separated by spaces (`--endpoints <url-a> <url-b>`); commas are not split.

### `QUERY_STORE_ABSENT`, `QUERY_STORE_REBUILD_UNSUPPORTED`, `TELEMETRY_VERIFICATION_FAILED`, `DAG_DATA_UNAVAILABLE`
**Cause:** Local read models and streams.
- `QUERY_STORE_ABSENT`: `query store sync` found no `.hardkas/store.db` (no transaction command creates it). Nothing is written.
- `QUERY_STORE_REBUILD_UNSUPPORTED`: `query store rebuild` with a `--backend` other than `sqlite` (such as `filesystem`), which keeps no index, so there is nothing to rebuild (exit 2).
- `TELEMETRY_VERIFICATION_FAILED`: `telemetry verify` found lines of `.hardkas/telemetry/telemetry.jsonl` that violate Telemetry Source Contract v1 (exit 1).
- `DAG_DATA_UNAVAILABLE`: a `query dag` view found no light-model DAG in `.hardkas/state.json`, which no command writes (exit 1).
**Solution:** Build the store with `hardkas query store rebuild` ([Query Store](../guides/query-store.md)); see [Event Ledger and Telemetry](../guides/telemetry.md) and [DAG Simulation](../guides/dag-simulation.md).

### `WALLET_TOOLKIT_METHOD_UNSUPPORTED`, `INDEXER_ARTIFACT_IDENTITY_INVALID`
**Cause:** `WalletToolkit.planSend()` and `sendSimulated()` never planned or sent anything (they returned placeholder data) and now refuse. `IndexerToolkit.ingestArtifact()` indexes only a HardKAS artifact whose `contentHash` its content verifies; the artifact given has none, or a wrong one.
**Solution:** Use `wallet.estimateFee()` (its `plan` is the real plan), `wallet.send()`, or `hardkas.tx.plan` / `hardkas.tx.send`. Index artifacts as HardKAS writes them.

### `PAYMENT_CHECK_NO_NODE`, `PAYMENT_CHECK_NODE_FAILED`
**Cause:** `PaymentToolkit.check(invoiceId)` (`@hardkas/toolkit`). `PAYMENT_CHECK_NO_NODE`: the toolkit was opened without a node (`options.rpc`), so nothing was checked. The error's metadata gives the stored status (`storedStatus`) and, for a paid invoice, how it was marked (`settlement: "simulated"` when `simulatePay()` set it). `PAYMENT_CHECK_NODE_FAILED`: the node was asked for the UTXOs at the merchant address and failed (connection, refusal, an address of another network). Nothing was marked paid; the cause is attached.
**Solution:** Open the toolkit with `{ rpc }` (a client that lists the UTXOs at an address) to check on a node, or read the stored record with `getInvoice()`. For a node failure, fix the node or the merchant address and check again.

### `PAYMENT_INVOICE_AMOUNT_CONTRADICTORY`, `PAYMENT_INVOICE_AMOUNT_UNKNOWN`
**Cause:** `PaymentToolkit`. `PAYMENT_INVOICE_AMOUNT_CONTRADICTORY`: `createInvoice()` was given both `amount` (whole KAS) and `amountSompi`, and they differ; no invoice was created. `PAYMENT_INVOICE_AMOUNT_UNKNOWN`: `check()` found an invoice stored before amounts were kept in sompi, whose whole-KAS amount was truncated to 0 (an invoice for less than 1 KAS), so the amount due is unknown and nothing was checked.
**Solution:** Give one amount (`amountSompi` is exact). Create an old invoice of less than 1 KAS again.

### `WALLET_WATCH_NODE_TIMEOUT`, `WALLET_WATCH_RESNAPSHOT_TIMEOUT`
**Cause:** `WalletToolkit.watch()`. `WALLET_WATCH_NODE_TIMEOUT`: a call of the watch got no answer within its bound: the node's identity (`getServerInfo`, 30 s, on the first connection or after a reconnection), the first snapshot of the address (120 s), or stopping while a re-snapshot was still running (30 s). On start the watch is not opened and its client is released; after a reconnection that pass is abandoned and the next reconnection tries again; on stop the client is released and `unwatch()` rejects with this code. `metadata.operation` names the call. `WALLET_WATCH_RESNAPSHOT_TIMEOUT` is logged, not thrown: the re-snapshot after a reconnection has not finished within 120 s, and until it does `utxos()` serves the view from before the disconnection. Underneath, `createUtxoContext` (`@hardkas/tx-builder`) bounds each re-snapshot call (`resnapshotTimeoutMs`, default 120,000) and reports `KASPA_WALLET_ADAPTER_RESNAPSHOT_TIMEOUT` to its `onError` listeners.
**Solution:** Usually a node that keeps the connection open and stops answering. Restart the watch or the node.

### `WALLET_HISTORY_UNSUPPORTED`, `WALLET_QUERY_PROVIDER_UNAVAILABLE`
**Cause:** `WalletToolkit.history()`. A wallet that reads through a node (`options.rpc`) gets the address's history over a bounded window of the node's chain (see `ADDRESS_HISTORY_*`). `WALLET_HISTORY_UNSUPPORTED` remains when no window can be bounded (no `since` given and the node cannot bound one), and for `historyPage()` on a wallet with a query provider, which has no window to report. A Kaspa node keeps no address history of its own. `WALLET_QUERY_PROVIDER_UNAVAILABLE`: the wallet's query provider failed; `history()` used to return the provider's failed result as if it were the history.
**Solution:** Give the wallet a query provider that keeps history (`options.provider`, for example an indexer), or use `watch()` for live activity.

### `WALLET_WATCH_NODE_NETWORK_CHANGED`
**Cause:** After a reconnection, the node behind a `WalletToolkit.watch()` URL named another network than before. The watch was stopped, and nothing that node answered was reported. A node naming mainnet gives `MAINNET_CONNECTION_DISABLED`.
**Solution:** Check what serves that URL, then start the watch again.

### `SESSION_OPERATION_UNSUPPORTED`, `SIMNET_MINE_BLOCKS_INVALID`, `SIMNET_MINE_NO_PROGRESS`, `SIMNET_MINE_UNOBSERVED`
**Cause:** Dev-server API.
- The session routes `start`, `snapshot`, `time-travel`, `export` and `import` are not implemented (HTTP 501); they used to answer `ok: true` with invented ids.
- `POST /api/simnet/mine?blocks=N` needs an integer N from 1 to 100 (HTTP 400).
- After mining, the node's DAA score did not advance, or could not be read (HTTP 502); the answer carries the scores seen.
**Solution:** Do not rely on the session routes. Mine 1–100 blocks at a time, and check the node when mining makes no progress.

### Dev server send guard
**Cause:** One dev server owns a workspace's send guard: its lock (`.hardkas/dev-server/send-guard.v1.lock`) holds the server's pid, and another process gets no broadcasting send (`SEND_GUARD_OWNED_BY_OTHER_PROCESS`), because two servers cannot coordinate idempotency or unknown outcomes. A server ended without running its handlers (on Windows `Stop-Process` or the Task Manager; `SIGKILL` elsewhere) leaves its lock behind.
- `SEND_GUARD_LOCK_STALE`: the lock names a pid that no longer runs. It is never taken over automatically; the refusal's message names the recovery, `hardkas dev recover-lock --pid <pid>`. Nothing was planned, signed or sent.

`hardkas dev recover-lock --pid <pid> [--workspace <dir>] [--json]` archives a stale lock: it renames it to `send-guard.v1.lock.stale-<pid>-<time>`, kept as evidence, only when it names that pid and that process is not running. The send-guard log is untouched, so sends whose outcome the stopped server left unknown still block until observed. Its refusals change nothing:
- `DEV_RECOVER_LOCK_PID_INVALID` (exit 2): `--pid` is not a positive whole number.
- `SEND_GUARD_LOCK_UNREADABLE` (exit 1): there is no lock, or it cannot be read.
- `SEND_GUARD_LOCK_PID_MISMATCH` (exit 2): the lock names another pid.
- `SEND_GUARD_LOCK_OWNER_ALIVE` (exit 3): that process is running and owns the guard.
- `SEND_GUARD_LOCK_RECOVERY_FAILED` (exit 1): any other failure of the recovery.

**Solution:** Stop every dev server on the workspace, run `hardkas dev recover-lock --pid <pid>` in that workspace with the pid the refusal names, then start one dev server. A live owner is stopped with Ctrl+C in its window, which releases the lock.

### `SEQUENCE_LOCK_UNVERIFIABLE`
**Cause:** A v1 transaction about to be sent has an input whose sequence enables a relative time lock, and the node's virtual DAA score or the UTXO's DAA score could not be read, so whether the lock is met cannot be checked. Sent and rejected, the identical transaction could never be sent again (one submission per txId). Nothing is sent or recorded.
**Solution:** Retry when the node answers `getBlockDagInfo` and lists the UTXO with its DAA score.

### `ESCROW_CONFIG_INVALID`
**Cause:** `createEscrow` / `escrowResolution` refused the escrow's configuration. Among other cases: a v2 full escrow (no `version`, or `version: "v2"`, not split) that gives no `principal` and names different `refundAmount` and `releaseAmount`, or no amount at all; or an `escrowNonce` that is not 32-byte hex. When `principal` is given it is the principal, whatever legacy amounts ride along.
**Solution:** Give `principal`, or `version: "v1"` for a legacy escrow whose refund and release amounts differ.

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

### `ZK_SPEND_*`, `ZK_OBSERVE_TXID_INVALID`, `ZK_FACT_INVALID`, `V1_P2SH_UNLOCK_MISMATCH`
**Cause:** `hardkas zk toccata spend` / `spendR0Groth16Lock` (SDK, also `sdk.experimental.zk.toccata.spend`) spends a RISC Zero Groth16 lock through HardKAS's send (a plan, the signed transaction, the ZK fact and one submission per txId, recorded); `zk toccata observe` looks at the spend. Nothing is sent when one of these is raised, except where it says so.
- `ZK_SPEND_NODE_REQUIRED`: the SDK instance runs the simulator, or the workspace has no Kaspa node for the network.
- `ZK_SPEND_NETWORK_UNSUPPORTED`: a ZK lock is spent or observed on simnet or testnet-10 only (mainnet is refused before anything, like every path).
- `ZK_SPEND_LOCK_REFUSED`: the lock is not one HardKAS spends: `verify-scripts` refuses it, its P2SH script is not the hash of its redeem script, or the receipt does not rebuild it. `ZK_SPEND_SCRIPTS_MISMATCH` / `ZK_SPEND_SCRIPTS_INVALID`: the `--scripts` record is not the one the receipt and its parameters build, or not a readable successful record. `ZK_SPEND_LOCK_REQUIRED` / `ZK_SPEND_LOCK_OPTIONS_CONFLICT`: give the lock as `--scripts` or as `--image-id`/`--journal-hash`, one of them.
- `ZK_SPEND_DESTINATION_REQUIRED`: a proof-only lock needs `--to`. `ZK_SPEND_UTXO_INVALID` / `ZK_SPEND_UTXO_NOT_FOUND`: the UTXO is malformed, or the node does not list it unspent at the lock's address.
- `ZK_SPEND_BUILD_REFUSED`: the ZK builder refused the spend; `metadata.issues` lists its codes. `ZK_SPEND_TXID_MISMATCH`, `ZK_SPEND_UNLOCK_UNAVAILABLE`: internal consistency checks.
- `ZK_SPEND_CONFIRMATION_REQUIRED` (exit 3): off simnet without `--yes`; nothing is read, built or sent.
- `ZK_SPEND_REJECTED_BY_NODE`: the node refused it; it is recorded and never sent again. `ZK_SPEND_OUTCOME_UNKNOWN`: no answer named the transaction; it may be held by the node; observe it. `ZK_SPEND_WAIT_TIMEOUT`: with `--wait`, not seen accepted in time; not sent again.
- `ZK_OBSERVE_TXID_INVALID` / `ZK_FACT_INVALID`: the txId is not 64 hex characters, or `--fact` is not a verified ZK fact of that txId.
- `V1_P2SH_UNLOCK_MISMATCH`: the unlock given for a P2SH input that is not a SilverScript contract (a ZK lock) is not push-only, or its redeem script does not hash to the input's script.
**Solution:** Build the lock with `zk toccata build-scripts`, fund exactly what it asks for, and spend it with the same receipt.

### `SILVER_TEST_NOT_REPRODUCIBLE`, `SILVER_TEST_INCONCLUSIVE`, `SILVER_TEST_FAILED`, `SILVER_TEST_FUNDING_FAILED`, `SILVER_TEST_FUNDER_REQUIRED`, `SILVER_TEST_OPTION_CONFLICT`, `SILVER_TEST_OPTION_NEEDS_ON_NODE`, `SILVER_TEST_NETWORK_INVALID`
**Cause:** `hardkas silver test --on-node` runs each case of a test file as the real transaction it describes, on a Kaspa node (simnet by default; mainnet refused first, `SILVERSCRIPT_MAINNET_NOT_ENABLED`; a public testnet only with the payments' opt-in and `--yes`, which confirms the funding and each case's spend: without it the run is refused with `TX_SEND_CONFIRMATION_REQUIRED`, exit 3, and nothing is sent), and records the node's verdict in `hardkas.silverNodeTest.v1`.
- `SILVER_TEST_NOT_REPRODUCIBLE` (exit 1): the run ended with cases no real transaction reproduces. Each is in the record with its own code and reason (`RUNNER_DEFAULT_SCENARIO`, `COVENANT_CONTEXT`, `MULTIPLE_INPUTS`, `FOREIGN_INPUT_SCRIPT`, `FABRICATED_OUTPOINT`, `SCENARIO_SIGNATURE`, `ARGUMENT_UNREADABLE`, `NO_OUTPUTS`, `OUTPUT_WITHOUT_ADDRESS`, `TX_VERSION_UNSUPPORTED`, `VALUE_OUT_OF_RANGE`, `HARDKAS_REFUSED` with the refusal's code, `SEQUENCE_LOCK_NOT_REACHED`). They have no node verdict and never count as passed.
- `SILVER_TEST_INCONCLUSIVE` (exit 1): the node answered, but not about the case: a spend expected to pass was accepted and not seen in a chain block within `--timeout` (no miner?), the node refused a spend for its coin, or it refused an expected failure for a reason outside the contract's script (fee, storage mass, lock time, sequence lock, version). No verdict either way.
- `SILVER_TEST_FAILED` (exit 1): with `--on-node`, a case the node judged against its expectation (accepted when it expected a failure, refused when it expected a pass). It outranks the two codes above.
- `SILVER_TEST_FUNDING_FAILED` (exit 1): the payment that funds a case's coin at the contract's P2SH was not accepted, or its plan did not pay the case's `utxo_value` there. The run stops without verdicts; coins already funded stay at the contract's address.
- `SILVER_TEST_FUNDER_REQUIRED` (exit 2): name the account that funds the coins with `--from <account>`.
- `SILVER_TEST_OPTION_CONFLICT` (exit 2): `--on-node` with `--runner` or `--allow-unverified-runner`; the node mode runs no case on the runner. `SILVER_TEST_OPTION_NEEDS_ON_NODE` (exit 2): `--network`, `--url`, `--from` or `--timeout` without `--on-node`; the runner mode runs no transaction on any node.
- `SILVER_TEST_NETWORK_INVALID`: the network has no address for the contract's P2SH lock.
**Solution:** Restate a not reproducible case as a transaction a node can see (one input at the contract, outputs to addresses, signatures named as `{"signature":"<account>"}`), or run it on the SilverScript runner (without `--on-node`), whose verdict is `SCRIPT_VM` only. For an inconclusive case, run a miner or raise `--timeout`, and check the fee and the coin.

### `WATCH_ADDRESS_INVALID`, `WATCH_NODE_NETWORK_MISMATCH`, `WATCH_ADDRESS_NETWORK_MISMATCH`, `WATCH_OPTION_INVALID`
**Cause:** `hardkas watch <address>` / `watchAddress`: the address is not a Kaspa address; the node serves another network than the one asked for; the address belongs to another network than the node's; `--timeout` or `--until` is not a positive integer in range. Nothing is tracked. Mainnet is refused before connecting.
**Solution:** Watch an address of the node's own network.

### `ESCROW_NOT_FOUND`, `ESCROW_RECORD_INVALID`, `ESCROW_NETWORK_MISMATCH`, `ESCROW_NETWORK_NOT_SUPPORTED`, `ESCROW_REQUEST_INVALID`, `ESCROW_REQUEST_MISMATCH`, `ESCROW_FUNDING_NOT_UNSPENT`, `ESCROW_DESTINATION_NOT_ADDRESS`
**Cause:** `sdk.escrow` and the `hardkas escrow` lifecycle commands (`create`, `fund`, `status`, `prepare`, `sign`, `release`, `reconcile`) run a v2 escrow's lifecycle in a workspace (records in `.hardkas/escrows/`), with the dev server's rules.
- `ESCROW_NOT_FOUND`: no escrow with that id in this workspace. `ESCROW_RECORD_INVALID`: a record file is not the record of the id it is named after.
- `ESCROW_NETWORK_MISMATCH`: the record or the release request is for another network. `ESCROW_NETWORK_NOT_SUPPORTED`: the workspace runs the simulator for that network; escrows run on a Kaspa node.
- `ESCROW_REQUEST_INVALID`: a release request file is not a `hardkas.escrow.releaseRequest.v1` with terms and a funding outpoint. `ESCROW_REQUEST_MISMATCH`: the request does not do what its escrow's terms say (the contract recompiled and the draft prepared again do not match it). Nothing is signed.
- `ESCROW_FUNDING_NOT_UNSPENT`: before a release is built, the node must list the escrow's funding unspent with the recorded amount and lock. It does not when the funding is not accepted yet (run `escrow reconcile`, then release), or another release already spent it. A release is deterministic and HardKAS sends one submission per txId, so an early refusal could never be retried.
- `ESCROW_DESTINATION_NOT_ADDRESS`: the release pays a script that is no standard address of the network.
- `ESCROW_RELEASE_UNPRICED`: the send's economic check refuses the release's plan. Nothing is sent or recorded. Internal guard: HardKAS checks the plan before it records the release.
- For SDK callers, the dev server's uncoded HTTP refusals now carry codes (the HTTP bodies are unchanged): `ESCROW_NOT_FUNDED`, `ESCROW_NOT_PREPARED`, `ESCROW_NOT_READY`, `ESCROW_ROLE_NOT_REQUIRED`, `ESCROW_POLICY_CHANGED`, `ESCROW_BRANCH_UNKNOWN`.
**Solution:** Follow the order create → fund → (reconcile) → prepare → sign (each required role) → release → reconcile, on the escrow's own network.

### `SILVER_COVENANT_INPUT_STATE_UNKNOWN`
**Cause:** `silver covenant advance`: an `--input` outpoint whose state this workspace's records of the covenant do not declare, or whose declared state does not commit to the output's address. Nothing is planned or signed. Exit code 2.
**Solution:** Give its state explicitly: `--input <txid:index>=<state-file>`.

### `KCC20_PROGRAM_INVALID`, `KCC20_HOLDER_INVALID`, `KCC20_INPUT_NOT_HELD`, `KCC20_INSUFFICIENT_TOKENS`, `KCC20_SIGNER_NOT_OWNER`, `KCC20_OWNER_SCHEME_UNSUPPORTED`, `KCC20_PLAN_UNSTABLE`
**Cause:** `sdk.kcc20` and `hardkas kcc20 deploy`, `hardkas kcc20 transfer` and `hardkas kcc20 balance` (experimental, on the v1 engine).
- `KCC20_PROGRAM_INVALID`: the contract is not a KCC-20 program as its KCC-20 artifact describes one (entries and KCC-1 dispatch tags, state fields, no covenant declarations of its own).
- `KCC20_HOLDER_INVALID`: an owner that is not an account, a Schnorr P2PK address or a 32-byte x-only key; a deploy without holders. Exit code 2.
- `KCC20_INPUT_NOT_HELD`: a transfer input that is not a live token output of the covenant (recorded here, listed unspent by the node, its state verified). Exit code 2.
- `KCC20_INSUFFICIENT_TOKENS`: the sender's live token outputs do not cover the transfer.
- `KCC20_SIGNER_NOT_OWNER`: the signing account is not the input's owner; checked before any private key is asked for. Exit code 2.
- `KCC20_OWNER_SCHEME_UNSUPPORTED`: an owner scheme the SDK does not sign (`p2pkh-ecdsa`, `p2sh`, `covenant-id`). Exit code 2.
- `KCC20_PLAN_UNSTABLE`: the plan with the owners' signatures is not the transaction they signed (the node's inputs or the fee changed between the two plannings). Nothing is sent; plan again.
- A transfer the KCC-20 rules reject is `KCC20_TRANSFER_REJECTED` (`metadata.rule` names the rule), before any key is read.
- `KCC20_FEE_SOURCE_REQUIRED`: a `kcc20 transfer` with no source for its network fee on the sender's side. The fee comes from the sender's token change output (it keeps what the fee leaves), else from the sender's own KAS coins, else from `--funder <account>`; never from a receiver's output. When neither the change nor the sender's coins can pay it and no funder is named, the transfer is refused before anything is signed. Name a funder.
- `kcc20 deploy` and `kcc20 transfer` broadcast: off simnet they need `--yes` (`TX_SEND_CONFIRMATION_REQUIRED`).
**Solution:** Transfer from the token outputs this workspace recorded, as their owner.

### `HD_WALLET_*`, `KEYSTORE_PASSWORD_TOO_SHORT`
**Cause:** HD wallets (`HdWalletManager` in `@hardkas/accounts`, `HardkasHdWallets` in the SDK, the `hardkas wallet hd` commands): a BIP39 recovery phrase and Kaspa's BIP32 derivation, encrypted in `.hardkas/wallets/`. No secret word, key or passphrase is ever printed in a message.
- Creating or importing: `HD_WALLET_NETWORK_UNKNOWN` (not a Kaspa network id; the simulator is refused), `HD_WALLET_MNEMONIC_INVALID` (not a valid English phrase of 12 or 24 words; the message names the word count only), `HD_WALLET_WORD_COUNT_UNSUPPORTED`, `HD_WALLET_LABEL_INVALID` (1–64 letters, digits, `_`, `-`), `HD_WALLET_LABEL_EXISTS`, `KEYSTORE_PASSWORD_TOO_SHORT` (at least 8 characters), `HD_WALLET_XPUB_INVALID` (a watch-only key must be an account-level kpub/ktub, not a master key), `HD_WALLET_MNEMONIC_REQUIRED` and `HD_WALLET_STDIN_CONFLICT` (CLI: give the phrase with `--mnemonic-env` or `--mnemonic-stdin`; only one secret can come from stdin).
- Opening: `HD_WALLET_NOT_FOUND`, `HD_WALLET_AMBIGUOUS` (name it by its id), `HD_WALLET_KEYSTORE_INVALID` (not a valid `hardkas.encryptedWalletKeystore.v1`), `HD_WALLET_UNLOCK_FAILED` (wrong password, or the authenticated header or the ciphertext was edited: AES-GCM cannot tell which; nothing was decrypted), `HD_WALLET_PASSPHRASE_REQUIRED`, `HD_WALLET_PASSPHRASE_MISMATCH` (the passphrase does not derive the wallet's recorded account keys), `HD_WALLET_KEYRING_DISPOSED`.
- Using: `HD_WALLET_WATCH_ONLY` (no phrase: it cannot sign, send, reveal or change password), `HD_WALLET_ACCOUNT_NOT_FOUND`, `HD_WALLET_INDEX_INVALID`, `HD_WALLET_GAP_LIMIT_INVALID` (1–1000), `HD_WALLET_AMOUNT_INVALID`, `HD_WALLET_RECIPIENT_INVALID`, `HD_WALLET_SIMULATOR_UNSUPPORTED` and `HD_WALLET_NETWORK_MISMATCH` (an HD wallet is scanned and spent on its own node network only), `HD_WALLET_EXTERNAL_SIGNER_CONFLICT` (the SDK instance has an external signer that would sign instead of the wallet), `HD_WALLET_INPUT_NOT_OWNED` (a defensive check: an input the wallet did not derive; nothing is signed), `HD_WALLET_REVEAL_CONFIRMATION_REQUIRED` (`wallet hd reveal` prints the phrase only with `--yes`).
**Solution:** Back up the phrase with `wallet hd reveal --yes` right after creating a wallet; recover it with `wallet hd import`.

### `ADDRESS_HISTORY_*`, `ARTIFACT_VERIFY_ADDRESS_INVALID`
**Cause:** `hardkas history <address>`, `readAddressHistoryOnNode` (SDK), `WalletToolkit.history()`, and `artifact verify|tx status --address`. A node keeps no address history, so HardKAS reads a bounded window of the node's selected chain. Mainnet is refused before connecting.
- `ADDRESS_HISTORY_USAGE`: an invalid option (address, network, `--since`, `--lookback`, `--max-blocks`, `--limit`, timeout, cursor), or a raw `--url` whose network cannot be told. Nothing is read.
- `ADDRESS_HISTORY_REQUIRES_NODE`: the simulator has no chain to read. `ADDRESS_HISTORY_NETWORK_MISMATCH`: the address, or the network the node serves, is not the one asked for.
- `ADDRESS_HISTORY_NODE_UNSUPPORTED`: the node cannot bound or serve a window (no sink or pruning point, or no `getVirtualChainFromBlockV2` at high verbosity). `ADDRESS_HISTORY_SINCE_UNAVAILABLE`: the start block is unknown or pruned on this node.
- `ADDRESS_HISTORY_CHAIN_ANSWER_INCOHERENT`: a chain answer whose blocks and acceptance data disagree; rejected whole.
- `ADDRESS_HISTORY_READ_FAILED` / `ADDRESS_HISTORY_TIMEOUT`: the first read failed, or the deadline passed before the window's start was known. Once reading, a failure or the deadline ends the window early and the result says so (`stoppedBy`).
- `ARTIFACT_VERIFY_ADDRESS_INVALID`: `--address` is not an address of the artifact's network, or `--lookback` is out of range or given without `--address`. Nothing is contacted.
- An unreadable workspace config is `HARDKAS_CONFIG_ERROR` before any connection: `hardkas history` never falls back to another node.
**Solution:** Give a window that starts at or after the node's pruning point (a chain block or a DAA score), on the address's own network.

### `WALLET_*` (browser wallets)
**Cause:** The browser wallet signer (`@hardkas/sdk/client`, `@hardkas/sdk`): KasWare, Kastle or Kaspire signs what HardKAS planned, and HardKAS checks what comes back. Nothing is signed or sent when one of these is raised. Mainnet is refused (`MAINNET_SIGNING_DISABLED`) before any wallet or node is contacted.
- Connecting: `WALLET_NOT_FOUND` (the extension is not injected in the page), `WALLET_METHOD_UNAVAILABLE` (it lacks a method HardKAS uses; the message lists the ones it has), `WALLET_REQUEST_REJECTED` (a declined popup or a locked wallet), `WALLET_NETWORK_MISMATCH` (the wallet is on another network than the transaction), `WALLET_NETWORK_UNKNOWN` (a network HardKAS cannot read as one Kaspa L1 network: it never guesses), `WALLET_ACCOUNT_CHANGED` (the active account changed: the session is dropped and a signature that came back meanwhile is not used), `WALLET_ADDRESS_UNSUPPORTED` (not a Schnorr P2PK address).
- Requests: `WALLET_SIGN_REQUEST_INVALID` (not a HardKAS sign request, or a plan a wallet cannot sign), `WALLET_REQUEST_MISMATCH` (the request is not the one HardKAS builds now for that plan and address), `WALLET_INPUT_NOT_OWNED` (an input that is not an output of the wallet's address), `WALLET_COVENANT_SIGNING_UNSUPPORTED` (Kastle signs only version-0 payments: a contract request, or a transaction that is not version 0, is refused before Kastle is asked; plan a version-0 payment, the default, or use KasWare. A Ledger account inside Kastle also refuses sign-only requests, Kastle's own refusal).
- What came back: `WALLET_SIGNED_PAYLOAD_UNREADABLE` (not a transaction HardKAS can read), `WALLET_SIGNED_TRANSACTION_CHANGED` (another transaction than the one sent; the message names the field), `WALLET_SIGNATURE_MISSING` (an input asked for came back without `41 <64-byte signature> 01`), `WALLET_SIGNATURE_INVALID` (well formed but not a valid SIGHASH_ALL signature by the address's key over HardKAS's transaction).
- Messages: `WALLET_MESSAGE_SIGNATURE_UNREADABLE` (none of the shapes HardKAS verifies: 128 hex characters, 88 base64 characters of a 64-byte signature, `{ address, signature }`), `WALLET_MESSAGE_ADDRESS_MISMATCH`, `WALLET_MESSAGE_SIGNATURE_INVALID` (does not verify with kaspa-wasm against the expected address).
- `WALLET_PROBE_LOOPBACK_ONLY`: the dev server's wallet probe answers loopback only.
**Solution:** Unlock the wallet, put it on the transaction's network, keep the same account during the request, and let HardKAS plan the transaction it asks the wallet to sign.

## UTXO read limits

### `RPC_RESPONSE_TOO_LARGE`
**Cause:** The node's answer is larger than the 100 MiB HardKAS reads in one RPC message (`SDK_WEBSOCKET_MAX_PAYLOAD_BYTES` in `@hardkas/kaspa-rpc`). In practice: one address holding more than about 277,000 UTXOs (about 378 bytes each in the answer), for example a mining address after hours of `localnet fund --keep-miner`. The answer is refused unread (the WebSocket closes with 1009); the node is fine. The error is never retried. `tx plan`, `tx flow`, `tx batch`, `accounts consolidate`, `rpc utxos`, `sdk.observe.address`, the SDK's `utxos.waitForSpendable*` and `tx` waits and `node.fundDevWallets` fail with it for such an address; a broadcast that meets it is an unknown outcome, not a rejection.
**What still works:** `accounts balance` reports the node's total and exits 0, with `utxoCount`, `spendableSompi`, `covenantBoundSompi` and `covenantUtxoCount` set to `null` and a `note`; `tx wait` lists the address in `utxoView.tooLargeToRead` and takes the state from the chain; `localnet fund` still funds.
**Solution:** Pay from, or consolidate into, another address; for a local node, fund without `--keep-miner` (or start the localnet over with `hardkas localnet reset`). Paginated UTXO reads (`getUtxosByAddressesV2`, rusty-kaspa #991) are merged upstream but in no rusty-kaspa release yet. The limit and why it is not raised: [Limitations](../status/limitations.md#one-addresss-utxo-list-at-most-about-277000-utxos).
