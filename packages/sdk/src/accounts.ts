import { Hardkas } from "./index.js";
import { HardkasAccount, resolveHardkasAccount } from "@hardkas/accounts";
import { formatSompiToKas } from "@hardkas/core";

/**
 * HardKAS Accounts Module
 * @alpha
 */
export class HardkasAccounts {
  constructor(private sdk: Hardkas) {}

  /**
   * Resolves an account by name or address.
   */
  async resolve(nameOrAddress: string): Promise<HardkasAccount> {
    return resolveHardkasAccount({
      nameOrAddress,
      config: { ...this.sdk.config.config, cwd: this.sdk.workspace.root } as any
    });
  }

  /**
   * Fetches the balance for an account.
   */
  async getBalance(
    accountNameOrAddress: string
  ): Promise<{ sompi: bigint; formatted: string }> {
    const account = await this.resolve(accountNameOrAddress);
    if (!account.address)
      throw new Error(`Account ${accountNameOrAddress} has no address`);

    const { balanceSompi } = await this.sdk.rpc.getBalanceByAddress(account.address);
    const sompi = BigInt(balanceSompi);

    return {
      sompi,
      formatted: formatSompiToKas(sompi)
    };
  }

  /**
   * Alias for getBalance.
   */
  async balance(accountNameOrAddress: string) {
    return this.getBalance(accountNameOrAddress);
  }

  /**
   * Lists all available HardKAS accounts.
   */
  async list(): Promise<Record<string, unknown>[]> {
    const { listHardkasAccounts, describeAccount } = await import("@hardkas/accounts");
    const accounts = listHardkasAccounts({ ...this.sdk.config.config, cwd: this.sdk.workspace.root } as any);
    return accounts.map((a) => describeAccount(a));
  }

  /**
   * Funds an account from another account (defaults to 'default' account).
   */
  async fund(
    accountNameOrAddress: string,
    options?: { from?: string; amount?: string | bigint }
  ): Promise<any> {
    let from = options?.from;
    const amount = options?.amount || "10"; // 10 KAS default

    if (!from) {
      const accountsList = await this.list();
      const accounts = accountsList.map((a: any) => a.name);
      if (accounts.includes("faucet")) {
        from = "faucet";
      } else if (accounts.includes("simulated_faucet")) {
        from = "simulated_faucet";
      } else if (
        (this.sdk.network as string) === "simulated" &&
        accounts.includes("alice")
      ) {
        from = "alice";
      } else {
        throw new Error(
          "No funding account available.\nFor simulated mode, run Hardkas.create({ network: 'simulated', autoBootstrap: true })\nor call accounts.fund(target, { from: 'alice' })."
        );
      }
    }

    if (from === accountNameOrAddress) {
      throw new Error(`Cannot fund account '${accountNameOrAddress}' from itself.`);
    }
    const plan = await this.sdk.tx.plan({
      from,
      to: accountNameOrAddress,
      amount
    });
    const signed = await this.sdk.tx.sign(plan, from);
    if ((this.sdk.network as string) === "simulated") {
      return this.sdk.tx.simulate(signed);
    } else {
      return this.sdk.tx.send(signed);
    }
  }
}
