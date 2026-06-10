# Kaspa Node Integration

HardKAS is designed to interface with `rusty-kaspad`.

## Simnet and Testnet

For development, you run `rusty-kaspad` with `--simnet`. HardKAS natively supports the `simnet` network ID.

## Coinbase Maturity

When mining on a local simnet, block rewards (coinbase transactions) are subject to a maturity window (e.g., 100 blocks). HardKAS's RPC provider automatically filters out immature UTXOs during the planning phase. If a transaction attempts to spend an immature UTXO, the node will reject it, but HardKAS prevents this by excluding them from the discovery payload.
