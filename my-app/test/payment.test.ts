import { scenario, expect } from "@hardkas/testing/scenarios";

scenario("payment flow", async ({ hk }) => {
  const alice = await hk.accounts.resolve("alice");
  const bob = await hk.accounts.resolve("bob");
  
  // Ensure Alice has funds
  await hk.localnet.fund(alice.address, { amount: "100" }); // 100 KAS

  const beforeBob = await hk.accounts.balance(bob.address);

  // Send 10 KAS from Alice to Bob
  const plan = await hk.tx.plan({
    from: alice.name,
    to: bob.address,
    amount: "10"
  });

  const signed = await hk.tx.sign(plan);
  const result = await hk.tx.send(signed);

  expect(result.receipt).toBeDefined();

  const afterBob = await hk.accounts.balance(bob.address);
  expect(afterBob.sompi - beforeBob.sompi).toBe(10n * 100000000n);
});
