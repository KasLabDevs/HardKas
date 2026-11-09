---
title: Common errors and recovery
description: The errors a team meets on the simnet path, with their real codes, what they mean and how to recover.
---

# Common errors and recovery

Every error below was produced on purpose while testing
[Build on your own simnet](./build-on-simnet.md), against a real `rusty-kaspad`
v2.1.0 simnet node. The full catalogue is in [Errors](../reference/errors.md) and
[Error Recovery](../reference/error-recovery.md).

**Tip:** add `--json` to see the stable error `code`. Some plain-text messages
print only the explanation (for example `tx send` of an edited file, or
`tx plan` with nothing to spend).

## Node and connection

### `RPC_CONNECTION_FAILED`

Nothing answers at the endpoint.

```text
{ "ok": false, "code": "RPC_CONNECTION_FAILED", "message": "Connection refused: Cannot connect to Kaspa RPC at ws://127.0.0.1:26599. Is kaspad running with --rpclisten-json? …" }
```

`rpc info` reports the same as `RPC_INFO_UNAVAILABLE`. Check that the container
runs (`docker ps`), that the port in `hardkas.config.ts` (`networks.simnet.rpcUrl`)
or `--url` is the one you published, and that the node was started with
`--rpclisten-json` ([Run your own simnet node](./simnet-node.md#2-start-the-node)).

### `NODE_NOT_SYNCED`

The node proved what it is but does not say it is synced, so commands that need
the current chain state use nothing from it:

```text
{ "ok": false, "code": "NODE_NOT_SYNCED", "message": "NODE_NOT_SYNCED: the node at ws://127.0.0.1:26520 serves simnet but says it is not synced: … Let it sync (a local node with no peers needs recent blocks), then retry; nothing was sent." }
```

A simnet node with no peers is "synced" only while it receives recent blocks: a
node that never mined, or one idle for a while, is not. Start (or restart) the
miner, wait until `npx hardkas rpc info --network simnet` shows `Synced: yes`,
then retry. `silver doctor` shows the same as `MISS node … not synced` and marks
deploy and covenants not ready.

## Funds

### `NO_SPENDABLE_UTXOS`

Nothing the planner may spend. Two forms:

```text
No UTXOs found for kaspasim:qz2n6h… on network 'simnet'.
```

The account has received nothing yet: fund it (mine to it, or pay it from the
miner account).

```text
{ "ok": false, "code": "NO_SPENDABLE_UTXOS", "message": "No UTXOs found for kaspasim:qqvek8… on network 'simnet' (127 UTXO(s) found, none mature: coinbase outputs are spendable only after the network's coinbase maturity)." }
```

The account only holds block rewards that are too recent. Keep the miner running
and retry after about 1,000 DAA (around a minute on the setup of
[step 3](./simnet-node.md#3-start-the-miner)). `accounts balance` counts those
outputs already, so a positive balance alone does not mean you can spend.

### `INSUFFICIENT_FUNDS_UPSTREAM`

```text
{ "ok": false, "code": "INSUFFICIENT_FUNDS_UPSTREAM", "message": "UPSTREAM_PLANNER_ERROR: Insufficient funds: upstream Generator could not build a transaction for 10000000000000 sompi total. (Insufficient funds)" }
```

The spendable outputs do not cover the amount plus the fee. Send less, or fund
the account. A very fragmented account can also need more inputs than one
transaction holds (`MULTI_TRANSACTION_PLAN_REQUIRED`): consolidate first
([Error Recovery](../reference/error-recovery.md#multi_transaction_plan_required)).

## Sending

### `ALREADY_SUBMITTED`

Not an error: `tx send` found that this transaction was already sent (a record
of this workspace, or the node already holds it) and sent nothing. It exits 0 and
reports the state it saw, for example `CONFIRMED`. Follow it with
`npx hardkas tx status <txId>`.

### `ARTIFACT_HASH_MISMATCH`

A record was edited after HardKAS wrote it:

```text
Issues:
- ERROR:    [ARTIFACT_HASH_MISMATCH] Hash mismatch: expected e4d52f99…e7ce, got b4b3f169…9f03
- ERROR:    [LABEL_MISMATCH] signedId signed-e4d52f991117c4d5 does not derive from the artifact's content hash
```

`tx send` refuses such a file before contacting the node (exit 1,
`"code": "ARTIFACT_HASH_MISMATCH"` with `--json`). Do not repair the hash: plan
and sign again from the last intact step.

### Mainnet refusals

`MAINNET_CONNECTION_DISABLED` (any command or SDK call that would reach a mainnet
node: `rpc *`, `accounts balance`, `tx plan`, `tx wait`, `doctor`, … — reads
included, even to an endpoint you declare),
`SILVERSCRIPT_MAINNET_NOT_ENABLED` (`silver deploy|spend|covenant … --network mainnet`),
`MAINNET_SIGNING_DISABLED` (`tx sign`; `--allow-mainnet-signing` has no effect in
this release) and `MAINNET_BROADCAST_DISABLED`. These are policy, not bugs:
mainnet is NO-GO and locked down in this release, and no flag or setting
enables it. Each refusal comes before any connection is attempted.

## Verifying

### `ARTIFACT_NETWORK_MISMATCH`

```text
✗ [ARTIFACT_NETWORK_MISMATCH] the artifact is for simnet; checking it on devnet would read one network as another. Nothing was contacted.
```

Check an artifact on its own network: omit `--network`, or pass the artifact's.

### `VERIFICATION_LEVEL_NOT_REACHED`

`--require network` or `--require consensus` was asked and the level was not
reached. The levels say why:

```text
  Consensus: NOT_CONFIRMED [BELOW_POLICY_DEPTH] · … 806 < 100000000 blue-score confirmations
  ✗ [VERIFICATION_LEVEL_NOT_REACHED] The artifact reached NETWORK_OBSERVED; --require consensus was asked.
```

`BELOW_POLICY_DEPTH`: wait for more blocks (the miner must run).
`NOT_FOUND`: the node did not see the transaction, which happens with another
node or a reset chain; it does not mean the transaction never existed
([what the levels mean](./receipts-and-levels.md#what-these-do-not-mean)).

## SilverScript

### `SILVER_VALUE_INVALID`

```text
{ "ok": false, "code": "SILVER_VALUE_INVALID", "message": "SILVER_VALUE_INVALID: arg[0]: not a byte array" }
```

A `bytes` (or `pubkey`) constructor argument was given as a hex string. Give it
as a list of numbers: `{"kind": "bytes", "value": [185, 7, …]}`
([the helper](./silverscript-covenants.md#constructor-arguments)).

### `--state-map` is not valid JSON

`silver covenant transition --state-map` fails with `SILVER_ARGS_INVALID` when its
value is not a JSON object of field → constructor parameter index. Inline JSON is
easy to break: some shells strip its quotes (Windows PowerShell 5.1 turns
`'{"value":0}'` into `{value:0}`). Pass the path of a JSON file instead, or use
the form for your shell from
[the table](./silverscript-covenants.md#advance-it-transition-7--12).

## ZK

### `ZK_ENGINE_UNAVAILABLE`

```text
"status": "ZK_GROTH16_VERIFIER_ERROR",
"issues": [{ "code": "ZK_ENGINE_UNAVAILABLE", "message": "Groth16 verification needs the optional peer dependency snarkjs, which is not installed … Nothing was verified." }]
```

`snarkjs` (GPL-3.0) is an optional peer of `@hardkas/sdk`. If you accept its
license: `npm install snarkjs@0.7.6` in the project. Without it nothing is ever
reported as verified. (A toy fixture with a known-weak verification key is
rejected first, with `ZK_VERIFICATION_KEY_WEAK_TRAPDOOR`, unless you pass
`--allow-weak-vk`.)

## Environment

- **A miner container that exits right away**: it started before the node listened
  on gRPC. `docker start my-simnet-miner` again.
- **`vitest` fails with `Cannot read directory "../../../.."` (esbuild)**: seen
  only with the project inside a folder another process holds open (here,
  `%TEMP%` on Windows). The same project elsewhere passed. Keep projects in a
  normal folder.
