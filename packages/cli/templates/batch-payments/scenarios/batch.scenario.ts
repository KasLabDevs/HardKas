import { scenario, expect } from "@hardkas/testing/scenarios";

scenario("batch payments flow", async ({ hk }) => {
  const sender = await hk.accounts.resolve("sender");
  const receivers = [
    await hk.accounts.resolve("receiver1"),
    await hk.accounts.resolve("receiver2"),
    await hk.accounts.resolve("receiver3")
  ];
  
  await hk.localnet.fund(sender.address, { amount: "100" });
  await hk.localnet.fund(sender.address, { amount: "100" });
  await hk.localnet.fund(sender.address, { amount: "100" });

  let totalSent = 0n;

  for (const receiver of receivers) {
    const beforeBalance = await hk.accounts.balance(receiver.address);

    const plan = await hk.tx.plan({
      from: sender.name,
      to: receiver.address,
      amount: "50"
    });

    const signed = await hk.tx.sign(plan);
    const result = await hk.tx.send(signed);

    expect(result.receipt).toBeDefined();

    const afterBalance = await hk.accounts.balance(receiver.address);
    expect(afterBalance.sompi - beforeBalance.sompi).toBe(50n * 100000000n);
    totalSent += 50n * 100000000n;
  }

  // The sender should have lost at least totalSent (plus fees)
  const senderBalance = await hk.accounts.balance(sender.address);
  expect(senderBalance.sompi).toBeLessThan(300n * 100000000n - totalSent);
});
