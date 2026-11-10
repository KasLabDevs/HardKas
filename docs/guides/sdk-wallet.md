# SDK Wallet Guide

The `@hardkas/sdk` provides programmatic access.

```javascript
import { Hardkas } from '@hardkas/sdk';

async function sendFunds() {
  const sdk = await Hardkas.create({ network: 'simulated' });
  
  // 1. Plan
  const plan = await sdk.tx.plan({ from: 'kaspa:sim_alice', to: 'kaspa:sim_bob', amount: '10' });
  
  // 2. Sign
  const signed = await sdk.tx.sign(plan, { account: 'kaspa:sim_alice' });
  
  // 3. Execute on the simulated ledger
  const { receipt } = await sdk.tx.simulate(signed);
  
  console.log("Success:", receipt.txId);
}
```
> [!TIP]
> Import only the entry points a package declares: `@hardkas/sdk` (and `@hardkas/sdk/client` for the dev-server client). Paths inside `dist/` are not exported, and Node refuses them.
