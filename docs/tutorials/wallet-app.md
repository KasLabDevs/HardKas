# Chapter 02: Wallet App

The most basic building block on Kaspa is the wallet. HardKAS provides `@hardkas/toolkit` to bootstrap a **development** wallet backend on the local simnet.

## Concepts
- **Deterministic Execution**: HardKAS runs purely local wallets in memory for testing and building without network dependency.
- **WalletToolkit**: The facade that orchestrates addresses, UTXOs, and Kaspa RPC.

> **Synthetic identity, simnet only.** The toolkit's identity is synthetic: its private keys are derived deterministically from the wallet's *name*, so anyone can compute them. It is not BIP39/BIP32 and it recovers no Kaspa wallet. It therefore works on **simnet only**: on testnet-10, mainnet, devnet or an unknown network, `create()` and `receive()` refuse with `WALLET_SYNTHETIC_NETWORK_BLOCKED` before any address exists. Never send real funds to one of these addresses. For real funds use an encrypted real account (`hardkas accounts real generate --network testnet-10 --password-env <VAR>`) and `hardkas tx plan`, `hardkas tx sign`, `hardkas tx send`.

```typescript
import { WalletToolkit } from '@hardkas/toolkit';

const wallet = WalletToolkit.open('alice', { storePath: '.hardkas/wallets.json', networkId: 'simnet' });
await wallet.create();
const addr = await wallet.receive(); // kaspasim:… — a synthetic simnet address, a development fixture
console.log('Wallet address:', addr);
```
