import { defineHardkasConfig } from "@hardkas/sdk";
import { task, types } from "@hardkas/core";

export default defineHardkasConfig({
  defaultNetwork: "simulated",
  network: { allowPublic: false },
  artifacts: { deterministic: true },
  networks: {
    simulated: {
      kind: "simulated",
      description: "Pure local simulation"
    }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:sim_alice" },
    bob: { kind: "simulated", address: "kaspa:sim_bob" }
  },
  tasks: {
    myfund: task("myfund", "Funds an account")
      .param("account", "Account to fund", types.string)
      .param("amount", "Amount to fund", types.number, 100)
      .action(async (args, hk) => {
        console.log(`[Task] Funding ${args.account} with ${args.amount} KAS...`);
        const acc = await hk.accounts.resolve(args.account);
        await hk.localnet.fund(acc.address, { amount: String(args.amount) });
        return { success: true, address: acc.address };
      })
  }
});
