# Chapter 11: Runtime & Docker Validations

HardKAS allows you to seamlessly transition your local app to a real Kaspa node without altering your public API surface.

## Using the RPC Backend Plugin
By default, `IndexerToolkit` uses an instant, local memory layout. To point it at a real network, supply the `@hardkas/plugin-rpc-backend`:

```ts
import { kaspaRpcBackendPlugin } from '@hardkas/plugin-rpc-backend';
import { IndexerToolkit } from '@hardkas/toolkit';

const indexer = await IndexerToolkit.open({
  backend: kaspaRpcBackendPlugin({ url: 'ws://127.0.0.1:18210' })
});
```

## Docker Simnet Troubleshooting
To validate your code realistically, we strongly recommend running the Rusty Kaspa node in `simnet` via Docker.

### 1. WebSockets & Windows WSL2
If you are running HardKAS on Windows through WSL2 but hosting the Docker container natively, you may encounter silent WebSocket drops (e.g. `WebSocket not connected`).
**Fix**: Ensure your Docker networking bridges `127.0.0.1:18210` correctly, or use the explicit IP address of your vEthernet switch.

### 2. UTXO Funding in Simnet
A fresh simnet node has no UTXOs. If your app attempts to transfer Kaspa, it will fail unless funded.
**Fix**: You must either explicitly mine blocks to your wallet address using the kaspad RPC, or configure HardKAS to inject synthetic UTXO fixtures before the transaction executes.
*Note: Real UTXO funding in simnet requires the node to be actively mining.*
