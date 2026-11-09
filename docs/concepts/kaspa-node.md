# Kaspa Node Integration

HardKAS is designed to interface with `rusty-kaspad`.

## Simnet and Testnet
For development, you run `rusty-kaspad` with `--simnet`. HardKAS natively supports the `simnet` network ID. 

## Coinbase Maturity
When mining on a local simnet, block rewards (coinbase transactions) are subject to a maturity window: 1,000 DAA on simnet, as observed against rusty-kaspad v2.1.0 ([Run your own simnet node](../start/simnet-node.md#5-wait-for-coinbase-maturity)). HardKAS's RPC provider automatically filters out immature UTXOs during the planning phase. If a transaction attempts to spend an immature UTXO, the node will reject it, but HardKAS prevents this by excluding them from the discovery payload.
