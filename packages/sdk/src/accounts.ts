import { Hardkas } from "./index.js";
import { HardkasAccount, resolveHardkasAccount } from "@hardkas/accounts";
import { formatSompi } from "@hardkas/core";

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
      formatted: formatSompi(sompi)
    };
  }

  /**
   * Alias for getBalance.
   */
  async balance(accountNameOrAddress: string) {
    return this.getBalance(accountNameOrAddress);
  }

  /**
   * Lists all configured account names.
   */
  async list(): Promise<string[]> {
    return Object.keys(this.sdk.config.config.accounts || {});
  }

  /**
   * Funds an account from another account (defaults to 'default' account).
   */
  async fund(
    accountNameOrAddress: string,
    options?: { from?: string; amount?: string | bigint }
  ): Promise<any> {
    let from = options?.from;
    const amount = options?.amount || "1000000000"; // 10 KAS default

    if (!from) {
      const accounts = await this.list();
      if (accounts.includes("faucet")) {
        from = "faucet";
      } else if (accounts.includes("simulated_faucet")) {
        from = "simulated_faucet";
      } else if (this.sdk.network === "simulated" && accounts.includes("alice")) {
        from = "alice";
      } else {
        throw new Error("No funding account available.\nFor simulated mode, run Hardkas.create({ network: 'simulated', autoBootstrap: true })\nor call accounts.fund(target, { from: 'alice' }).");
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
    if (this.sdk.network === "simulated") {
      return this.sdk.tx.simulate(signed);
    } else {
      return this.sdk.tx.send(signed);
    }
  }
}
