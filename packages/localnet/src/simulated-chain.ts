import type { HardkasAccount } from "./accounts";

export interface SimulatedUtxo {
  readonly id: string;
  readonly address: string;
  readonly amountSompi: bigint;
  readonly spent: boolean;
}

export interface Snapshot {
  readonly id: string;
  readonly utxos: readonly SimulatedUtxo[];
  readonly daaScore: bigint;
}

export class SimulatedKaspaChain {
  private utxos: SimulatedUtxo[] = [];
  private daaScore = 0n;

  constructor(accounts: readonly HardkasAccount[]) {
    for (const account of accounts) {
      this.utxos.push({
        id: `genesis:${account.name}:0`,
        address: account.address,
        amountSompi: account.balanceSompi,
        spent: false
      });
    }
  }

  getDaaScore(): bigint {
    return this.daaScore;
  }

  mineBlock(): bigint {
    this.daaScore += 1n;
    return this.daaScore;
  }

  getBalance(address: string): bigint {
    return this.utxos
      .filter((utxo) => utxo.address === address && !utxo.spent)
      .reduce((sum, utxo) => sum + utxo.amountSompi, 0n);
  }

  getUtxos(address: string): readonly SimulatedUtxo[] {
    return this.utxos.filter((utxo) => utxo.address === address && !utxo.spent);
  }

  fund(address: string, amountSompi: bigint): SimulatedUtxo {
    if (amountSompi <= 0n) {
      throw new Error("Faucet amount must be positive.");
    }

    const utxo: SimulatedUtxo = {
      id: `faucet:${address.slice(-8)}:${this.daaScore}:${this.utxos.length}`,
      address,
      amountSompi,
      spent: false
    };

    this.utxos.push(utxo);
    this.mineBlock();

    return utxo;
  }

  /**
   * Creates a snapshot of the current chain state.
   * Snapshot IDs use Date.now() and are intended for session-based 
   * debugging and restore points, not for canonical identity.
   */
  snapshot(): Snapshot {
    return {
      id: `snapshot:${Date.now().toString(36)}`,
      utxos: this.utxos.map((utxo) => ({ ...utxo })),
      daaScore: this.daaScore
    };
  }

  restore(snapshot: Snapshot): void {
    this.utxos = snapshot.utxos.map((utxo) => ({ ...utxo }));
    this.daaScore = snapshot.daaScore;
  }
}
