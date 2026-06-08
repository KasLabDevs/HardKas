# 5-Minute Quickstart

Get up and running with HardKAS in a local simulated environment in under 5 minutes.

## 1. Installation

Install the HardKAS SDK and CLI locally in your project. We enforce local installation to guarantee exact deterministic versioning.

```bash
npm install @hardkas/sdk@0.9.0-alpha
npm install -D @hardkas/cli@0.9.0-alpha
```

## 2. Initialize the Workspace

Initialize your `.hardkas/` workspace using the CLI. This creates the local isolated environment for all artifacts.

```bash
npx @hardkas/cli init .
```

## 3. CLI Workflow

You can interact with HardKAS via the CLI to create deterministic artifacts.

```bash
# 1. Plan a transaction
npx @hardkas/cli tx plan --from alice --to bob --amount 10000

# 2. Sign the planned transaction (using the printed artifact ID)
npx @hardkas/cli tx sign <plan_artifact_id> --signer alice

# 3. Send to the simulated network
npx @hardkas/cli tx send <signed_artifact_id>
```

## 4. SDK Workflow

For programmatic control, use the Node.js SDK. This script demonstrates the full deterministic lifecycle.

```typescript
import { Hardkas } from '@hardkas/sdk';

async function run() {
  // 1. Initialize the SDK connected to the local simulated network
  const sdk = await Hardkas.create({ 
    cwd: process.cwd(), 
    autoBootstrap: true, 
    network: 'simulated' 
  });

  // 2. Plan
  const plan = await sdk.tx.plan({
    from: 'alice',
    to: 'bob',
    amount: '10000'
  });
  console.log('Plan created:', plan.artifactId);

  // 3. Sign
  const signedTx = await sdk.tx.sign(plan, 'alice');
  console.log('Signed artifact:', signedTx.artifactId);

  // 4. Simulate & Send
  const result = await sdk.tx.simulate(signedTx);
  console.log('Simulation Receipt:', result.receipt.artifactId);
  
  // Note: We use simulate() locally for identical determinism guarantees without needing Kaspa PoW.
}

run().catch(console.error);
```
