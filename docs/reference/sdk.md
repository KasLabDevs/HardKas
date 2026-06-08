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

## `sdk.accounts.list()`
Returns an array of strings representing available account addresses.
