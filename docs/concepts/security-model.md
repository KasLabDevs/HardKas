---
title: Security Model
description: What HardKAS protects (keys, artifacts, workspace, execution boundaries), what it does not, and the mainnet lockdown.
---

# Security Model

HardKAS is developer infrastructure, not a custody solution and not a consensus-security layer. It protects your
inputs, your plans, your keys on disk and your local workspace. Kaspa consensus alone decides whether a transaction is
valid on the network: a transaction HardKAS planned and signed correctly can still be rejected by a node, for example
when an input was spent in the meantime.

## Mainnet is locked down

In this release HardKAS makes no connection to a mainnet node (reads included, even to an endpoint you declare), signs
nothing for it and broadcasts nothing to it. These are constants, not settings: no flag, option, environment variable
or configuration enables them (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`).

- **No mainnet keys.** `hardkas accounts real import`, `hardkas accounts real generate`, `hardkas kaspa wallet create`
  and `hardkas wallet hd` refuse a mainnet network or address before any key exists or is read
  (`MAINNET_SIGNING_DISABLED`).
- **No mainnet connection.** Every read, observation or send toward mainnet is refused before any node is contacted.
- **Offline verification only.** A mainnet record can still be checked for integrity
  (`hardkas artifact verify <path>`), never against a node.

Any future mainnet path needs the product complete, an independent audit and the owner's explicit authorization, and
it would be explicit, guarded and documented on its own. Public testnets are opt-in and experimental (see
[execution worlds](./execution-worlds.md#rpc-a-public-testnet)).

## Authority: who may spend

Authority comes from the operation, not from a label on an identity. Three roles are kept apart:

- **Funding authority** creates value. On localnet, `hardkas localnet fund <identifier>` mines to the account (or the
  localnet Treasury pays it). The miner assigns the new outputs to the address and gains no authority over it.
- **The recipient** is an address in a transaction's outputs. Receiving needs no signing authority: an address HardKAS
  cannot sign for (an `external-wallet`) is a valid recipient.
- **The signer** holds the key that satisfies the script of each input it spends.

Each step proves less than the next one needs:

- **A plan is not an authorization.** A `TxPlan` maps inputs to outputs; making one needs no key (`tx plan --from`
  takes a bare address). Signing fails if HardKAS does not hold the key.
- **A signed transaction is not node acceptance.** It shows that the authority was exercised. The node can still refuse
  it: an input already spent, a fee below its floor, a lock time not reached.
- **Node acceptance is not finality.** A node send records a `TxSubmission` with its `txId`; acceptance can still be
  undone by a reorg until the transaction is final. `hardkas tx wait <txId>` waits for a confirmation depth set by
  HardKAS's policy, which is not finality.

### When HardKAS does not hold the key

A cold wallet, a multisig quorum or an external custodian signs outside HardKAS. This build cannot export a PSKT (every
PSKT operation is unavailable; see [PSKT](./pskt/index.md)). An external key signs outside HardKAS, or through a
[browser wallet](../start/browser-wallets.md) (KasWare, Kastle, Kaspire; experimental): the wallet signs what HardKAS
planned and HardKAS checks what comes back. `hardkas tx sign --threshold` is a synthetic multisig for tests: it
produces no Kaspa multisig script.

## Keys on disk

**The rules:**

1. **Development keys are public.** The dev accounts alice…erin and the localnet Treasury have deterministic keys
   that anyone can compute. They exist for the simulator and simnet only.
2. **An address is not a key.** HardKAS can plan for and fund an address it cannot sign for.
3. **Never commit `.hardkas/`.** It holds keystores, and plaintext keys if you created any. `hardkas init` writes a
   `.gitignore` for it.

**Encrypted keystores.** `hardkas accounts real generate` and `hardkas accounts real import` encrypt the key with a key
derived by Argon2id and AES-256-GCM, which also authenticates the keystore's metadata (network, address). The envelope
is a file in `.hardkas/keystore/`; `.hardkas/accounts.real.json` keeps a reference to it (`keystoreRef`), not the key.
The password comes from `--password-env <env>` or `--password-stdin`, and the key is decrypted only to sign: planning
never loads it.

**Plaintext keys.** `--unsafe-plaintext` (on `accounts real generate` and `accounts real import`) and
`hardkas localnet account create` write the raw key into `.hardkas/accounts.real.json`. Anyone who can read the
workspace can spend with it. The CLI warns and asks for confirmation (unless `--yes`), refuses plaintext for a mainnet
key, and `hardkas doctor` reports plaintext keys (`PLAINTEXT_KEYS_FOUND`). Use it for disposable simnet accounts only.

**Intentional export.** Some commands reveal a key on purpose, so that you can load a development key into a wallet:
`hardkas dev accounts reveal <alias>` (simnet only), `hardkas dev accounts export kasware`, and
`hardkas kaspa wallet create --show-private-key` (which stores nothing). Without the explicit command or flag, listing
and configuration commands (`hardkas config show --json`, `hardkas kaspa wallet list --json`) never print a secret.

**Recovery phrases.** `hardkas wallet hd` keeps BIP39 recovery phrases encrypted in `.hardkas/wallets/`
(experimental). `accounts real import` takes a private key, never a phrase.

### The WASM key boundary

The Kaspa WebAssembly module makes `PrivateKey` objects that point into process-local memory (`__wbg_ptr`). HardKAS never
passes such an object across a process, worker, browser or serialization boundary. A key travels as a validated hex
string, is pushed into WASM for the duration of the signature, and is released right after.

## Workflow protections

HardKAS checks a transaction at several stages before a node sees it. These are local development protections, not
properties of the Kaspa protocol.

- **Maturity filtering.** The planner leaves out outputs that are not mature yet (coinbase outputs above all), which a
  node would refuse.
- **Pending spends.** On a node, the planner reads the node's mempool and leaves out every outpoint that a pending
  transaction of the sender already spends.
- **Selected-input re-check.** At the end of planning, every selected input must still be unspent at the node and
  not spent in its mempool; otherwise planning retries and then fails (`SELECTED_UTXO_INVALIDATED`). New blocks alone
  never invalidate a plan.
- **Fee limits.** `--max-fee` (and a network's `maxFeeSompi`) is recorded in the plan and enforced again at sign and
  at send (`FEE_EXCEEDS_MAX`).
- **Execution guard.** A plan made for one world or network is refused in another, and a synthetic simulator account
  cannot sign for a node (see [the execution guard](./execution-worlds.md#the-execution-guard)).
- **Preflight.** `hardkas tx send --preflight` checks every input and its signature against the node right before the
  broadcast. It is one node's view, not consensus validation.
- **Workspace locks.** Store writes are atomic and coordinated by lock files in `.hardkas/locks/`, so two processes
  (or two terminal tabs) do not corrupt the same store.

Each public send route and what it checks is listed in [send routes](../status/send-routes-security.md).

<!-- qualification: workspaceLocks -->

## Artifact integrity

An artifact's identity is its content hash (see the [artifact lifecycle](./artifact-lifecycle.md)).
`hardkas artifact verify <path>` and `hardkas verify` recompute that hash and compare it with the recorded
`contentHash`; changing an amount, a recipient, a network or an input after the fact makes verification fail.

That hash is **integrity, not authentication**: it has no key, so whoever can write the workspace can also write an
artifact that verifies. What stops a forged transaction is the signature, which the node checks, and the binding of a
signed transaction to its plan. The [security claims matrix](../status/security-claims.md) lists what is protected and
what is not.

### Stored evidence is write-once

An artifact is stored under its identity once:

- Writing the same identity again keeps the stored copy byte for byte, and that stored copy is what the command returns
  or prints. Its `createdAt` and other fields outside the identity stay those of the first write.
- If the stored copy no longer verifies as that identity (it was edited), is not that identity, or is not JSON, the
  write fails with `ARTIFACT_IDENTITY_CONFLICT` and the file is left exactly as it is. A second write never repairs
  edited evidence, so the edit stays visible to `hardkas verify`.

## Credentials in URLs

An RPC URL may carry a credential. HardKAS records and shows it without the credential:

- the userinfo (`user:password@`) is removed;
- the value of every query parameter named as a secret is replaced by `REDACTED`. The names are compared without case,
  and `_` and `-` are ignored: `token`, `accessToken`, `authToken`, `apiKey`, `key`, `auth`, `access_token`, `api_key`,
  `sig`, `signature`, `password`, `passphrase`, `secret`, `secretKey`, plus the structured secret field names such as
  `privateKey` and `mnemonic`;
- the scheme, host, port, path and the other query parameters are kept as they are.

This applies to what is written into evidence and state (`txSubmission.rpcUrl` and its recorded submit error,
`txPlan.rpcUrl`, `txObservation.rpcUrl`, the fork source in `localnet.json`) and to everything the CLI prints,
including error messages and the dev server's access log. Lock files record the command, never its arguments.

> [!NOTE]
> A credential embedded in an opaque path segment (for example `https://provider.example/v3/<key>`) cannot be
> identified generically without knowing the provider, and is kept as it is.

Evidence written before this rule is never rewritten. `hardkas kaspa wallet create` stores nothing, so without
`--show-private-key` it refuses before generating a key, and points to `accounts real generate --password-env` for a
stored, encrypted account. While mainnet is locked down, it refuses a mainnet network in any spelling or config alias
(`MAINNET_SIGNING_DISABLED`), with or without `--show-private-key`, before any key exists.

## Operator traps

- **Plaintext keys.** `--unsafe-plaintext` puts the raw key in `.hardkas/accounts.real.json`: a stray commit or a
  compromised dependency can sweep it. Keep it to disposable simnet accounts; use an encrypted keystore on a testnet.
- **The wrong network.** HardKAS refuses an account or a plan of another network (`ACCOUNT_NETWORK_MISMATCH`,
  `EXECUTION_NETWORK_MISMATCH`) and checks that a node serves the plan's network before a send. A raw transaction you
  extract and submit to a node yourself gets none of these checks. Bind the workspace's targets
  (`execution.default` and `execution.targets` in `hardkas.config.ts`) to the networks you mean.
- **Signing what you have not read.** Check the amounts and recipients of a transaction someone else built before you
  sign it, with a tool that decodes it. HardKAS cannot import a PSKT in this build, and `hardkas pskt inspect` shows a
  session file's metadata only: it decodes no payload and is no pre-signing check.
- **The wrong workspace.** With several workspaces open in several terminals, a send can go out from the wrong one.
  Check `hardkas status` and `hardkas config show` before a state-changing command. `hardkas env check` checks only
  the `HARDKAS_*` environment variables.
- **Deleting evidence.** Deleting `.hardkas/artifacts/` does not touch the chain, but it loses the link between your
  sources (for example a SilverScript `.sil` file) and what you deployed. Treat artifacts as records and back them up.

## Invariants

These are the rules the system keeps as it grows:

1. **Artifacts.** Changing a meaningful field after creation (amounts, recipients, network, inputs, outputs, payloads,
   lineage) invalidates verification. Tool metadata may change; financial or network intent may not.
2. **Signer.** Private keys never cross a process, worker, browser or serialization boundary as live WASM objects.
3. **Providers.** Simulated execution and node execution are different modes. Moving from the simulator to simnet is
   always explicit (a target, a network or a provider).
4. **Network.** A transaction artifact belongs to exactly one network. The network chosen at planning is part of the
   intent: if the target network changes, make a new plan.
5. **UTXOs.** Wallet size and transaction size are separate. The planner selects the inputs one transaction can carry;
   the signer never receives a whole wallet.
6. **RPC.** What can be checked locally (artifact integrity, network, addresses, signature structure) fails locally,
   before a node is asked.
7. **Mainnet.** Locked down, as above.

## Limits

- HardKAS does not provide absolute safety, and it does not replace custody.
- It cannot detect a stolen key, sandbox a malicious dependency, or stop you from signing a payment to the wrong
  address on purpose.
- A planned and signed transaction is not guaranteed to be included: fees and reorgs are resolved by Kaspa consensus.
- If a feature is not in the capability report (the SDK's `capabilities.get()`, derived from the checks the features
  themselves use), do not assume it exists.
