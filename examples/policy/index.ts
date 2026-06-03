import { Hardkas } from '@hardkas/sdk';

async function main() {
  const sdk = await Hardkas.create({ network: 'simulated', autoBootstrap: true });
  
  const plan = await sdk.tx.plan({ from: 'alice', to: 'bob', amount: '100' });
  await sdk.artifacts.write(plan);
  
  // Example of a deterministic policy check before signing
  if (BigInt(plan.amountSompi) > 5000000000n) { // > 50 KAS
      console.log("Policy rejected: Amount too high. Safe rejection.");
      // In production, you would throw or return a custom error
      return;
  }
  
  await sdk.tx.sign(plan, 'alice');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
