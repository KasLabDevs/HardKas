# SDK Reference

## `Hardkas.create(config)`
Initializes the SDK instance.
- **config.network**: `simulated`, `testnet-10`, `mainnet`.
- **config.provider**: `{ type: 'rpc', url: '...' }`

## `sdk.tx.plan(args)`
Returns a deterministic `txPlan` artifact object.

## `sdk.tx.sign(plan, account)`
Returns a deterministic `signedTx` artifact object.

## `sdk.tx.send(signedTx)`
Submits to the network and returns a `receipt` artifact.
- On a real network the node must say it is synced (`getServerInfo.isSynced: true`), asked before anything is sent or
  recorded; otherwise `NODE_NOT_SYNCED`. `{ allowUnsyncedNode: true }` lifts it on simnet and devnet only
  (`SEND_UNSYNCED_NODE_NOT_ALLOWED` elsewhere). See `docs/status/send-routes-security.md`, note 7.

## `sdk.accounts.list()`
Returns an array of strings representing available account addresses.
