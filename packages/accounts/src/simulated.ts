import type { HardkasSigner, HardkasSyntheticAccount } from "./types.js";

export class SimulatedSigner implements HardkasSigner {
  constructor(public readonly account: HardkasSyntheticAccount) {}

  async signTransaction(tx: unknown): Promise<unknown> {
    return {
      tx,
      signature: "simulated",
      account: this.account.name
    };
  }
}
