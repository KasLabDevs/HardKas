# SDK Wallet Guide

The `@hardkas/sdk` provides programmatic access.

```javascript
import { Hardkas } from '@hardkas/sdk';

async function sendFunds() {
  const sdk = await Hardkas.create({ network: 'simulated' });
  
  // 1. Plan
  const plan = await sdk.tx.plan({ from: 'kaspa:sim_alice', to: 'kaspa:sim_bob', amount: '10' });
  
  // 2. Sign
  const signed = await sdk.tx.sign(plan, 'kaspa:sim_alice');
  
  // 3. Send
  const receipt = await sdk.tx.simulate(signed);
  
  console.log("Success:", receipt.txId);
}
```
> [!TIP]
> Do not use deep imports like `import { planner } from '@hardkas/sdk/dist/planner'`. Only use the top-level `Hardkas` export.
