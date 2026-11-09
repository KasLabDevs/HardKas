# Configuration

HardKAS discovers its environment via `hardkas.config.ts`.

```typescript
import { defineConfig } from '@hardkas/cli';

export default defineConfig({
  network: 'simulated', // or 'testnet-10', 'mainnet'
  provider: {
    type: 'simulated' // or 'rpc'
  }
});
```

## Environments
- **simulated**: Completely offline, deterministic. Uses `.hardkas/localnet.json` for state.
- **rpc**: Connects to a live `rusty-kaspad` instance. Requires a `url` parameter.

## What `hardkas init` writes

`hardkas init` generates the current form: `defineHardkasConfig` from
`@hardkas/sdk`, named execution targets (`simulator`, the default, and
`localnet` for `simnet`) and a `networks` map. Each node network has an `rpcUrl`;
commands given `--network simnet` use it, and `--url` overrides it for one
command. To use a node of your own, change `networks.simnet.rpcUrl` (see
[Run your own simnet node](./simnet-node.md#4-point-the-workspace-at-the-node)).
`npx hardkas config networks` lists what the workspace declares.
