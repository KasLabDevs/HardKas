import { scenario, expect } from "@hardkas/testing/scenarios";

scenario("local indexer query flow", async ({ hk }) => {
  const alice = await hk.accounts.resolve("alice");
  const bob = await hk.accounts.resolve("bob");
  
  await hk.localnet.fund(alice.address, { amount: "100" });

  const plan = await hk.tx.plan({
    from: alice.name,
    to: bob.address,
    amount: "10"
  });

  const signed = await hk.tx.sign(plan);
  const result = await hk.tx.send(signed);

  expect(result.receipt).toBeDefined();

  // The localnet/test runner will automatically sync the query store behind the scenes,
  // but we test fetching the projection.
  const bobBalance = await hk.accounts.balance(bob.address);
  expect(bobBalance.sompi).toBeGreaterThan(0n);
});
