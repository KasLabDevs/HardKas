import type { HardkasSigner, HardkasSimulatedAccount } from "./types";

export class SimulatedSigner implements HardkasSigner {
  constructor(public readonly account: HardkasSimulatedAccount) {}

  async signTransaction(tx: unknown): Promise<unknown> {
    return {
      tx,
      signature: "simulated",
      account: this.account.name
    };
  }
}
