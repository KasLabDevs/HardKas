import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.open({ cwd: process.cwd() });
  sdk.enforcePolicy("mutation", "preventing unsafe tx");

  // `sdk.accounts.resolve` returns HardkasAccount which can be used in plan
  const alice = await sdk.accounts.resolve("alice");
  const bob = await sdk.accounts.resolve("bob");

  const planResult = await sdk.tx.plan({
    from: alice,
    to: bob,
    amount: 1000n
  });

  const planArtifact = planResult;
  await sdk.artifacts.write(planArtifact as any);

  const signedArtifact = await sdk.tx.sign(planArtifact);
  await sdk.artifacts.write(signedArtifact as any);

  const receipt = await sdk.tx.send(signedArtifact);
  await sdk.artifacts.write(receipt as any);

  console.log(`Transaction successful! Receipt ID: ${(receipt as any).txId}`);
  
  const verifyResult = await sdk.artifacts.verify(receipt);
  console.log("Verification OK:", verifyResult.ok);
}

main().catch(console.error);
