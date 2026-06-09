# Providers

Providers decide where transaction state comes from and where a signed transaction is executed.

## Simulated Provider

The simulated provider is the default local development backend. It uses local workspace state, produces deterministic artifacts, and does not connect to a Kaspa node.

Typical CLI path:

```bash
hardkas tx send --from alice --to bob --amount 1 --network simulated --yes
```

Typical SDK path:

```typescript
const plan = await sdk.tx.plan({
  from: "alice",
  to: "bob",
  amount: "1",
  network: "simulated"
});

const signed = await sdk.tx.sign(plan, { account: "alice" });
const receipt = await sdk.tx.simulate(signed);
```

Use this provider for tutorials, CI, demos, and local agent workflows.

## RPC Provider

The RPC provider talks to a real Kaspa node endpoint. In the current local-first model, this is an explicit advanced path. Do not rely on implicit defaults when you want a real node; pass the network, provider, and URL clearly.

Example:

```bash
hardkas tx plan \
  --from kaspa:sim_my_miner \
  --to kaspa:sim_destination_wallet \
  --amount 100 \
  --network simnet \
  --provider rpc \
  --url ws://127.0.0.1:18210 \
  --out simnet-plan.json
```

The RPC provider does not create consensus. It asks the node for UTXOs, submits signed payloads, and reports what the node accepts. Coinbase maturity, DAA score, fees, node reachability, and network state are external dependencies.

## Mainnet Boundary

Mainnet is not part of the default happy path. Any mainnet-capable flow must be explicit, guarded, and reviewed separately from local simulation.
