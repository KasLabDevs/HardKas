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
