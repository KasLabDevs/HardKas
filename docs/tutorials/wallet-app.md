# Chapter 02: Wallet App

The most basic building block on Kaspa is the wallet. HardKAS provides `@hardkas/toolkit` to instantly bootstrap a wallet backend.

## Concepts
- **Deterministic Execution**: HardKAS runs purely local wallets in memory for testing and building without network dependency.
- **WalletToolkit**: The facade that orchestrates addresses, UTXOs, and Kaspa RPC.

```typescript
import { WalletToolkit } from '@hardkas/toolkit';

const wallet = WalletToolkit.open('alice', { storePath: '.hardkas/wallets.json' });
await wallet.create();
const addr = await wallet.address();
console.log('Wallet address:', addr);
```
