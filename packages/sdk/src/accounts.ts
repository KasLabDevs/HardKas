import { Hardkas } from "./index.js";
import { 
  HardkasAccount, 
  resolveHardkasAccount 
} from "@hardkas/accounts";
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
      config: this.sdk.config.config
    });
  }

  /**
   * Fetches the balance for an account.
   */
  async getBalance(accountNameOrAddress: string): Promise<{ sompi: bigint, formatted: string }> {
    const account = await this.resolve(accountNameOrAddress);
    if (!account.address) throw new Error(`Account ${accountNameOrAddress} has no address`);
    
    const { balanceSompi } = await this.sdk.rpc.getBalanceByAddress(account.address);
    const sompi = BigInt(balanceSompi);
    
    return {
      sompi,
      formatted: formatSompi(sompi)
    };
  }
}
