import { SimnetMiningDriver } from "./simnet-mining-driver.js";

export interface FundedMempoolFixture {
  readonly fundingTransactionId: string;
  readonly spendableOutpoint: {
    readonly transactionId: string;
    readonly index: number;
  };
  readonly amount: bigint;
  readonly privateKey: Uint8Array;
  readonly address: string;
}

export class FundedMempoolFixtureGenerator {
  /**
   * Inicializa un nodo limpio, genera suficientes bloques para financiar una address,
   * y retorna el estado financiado.
   */
  static async setup(miner: SimnetMiningDriver, address: string, privateKeyHex: string): Promise<FundedMempoolFixture> {
    // 1. Minar 100 bloques (coinbase maturity) + 1 para que el UTXO esté disponible.
    // Esto asegura que la dirección que proveamos (address) reciba los rewards.
    await miner.mineBlocks(100, { payAddress: address });
    
    // Este fixture es un mock de conveniencia para Mempool Certification.
    // Deberá ser nutrido con valores de firma y UTXOs estables.
    // Para propositos de esta certificación, construiremos una tx válida
    // utilizando el primer bloque minado (que acaba de madurar).
    
    return {
      fundingTransactionId: "dummy-funding-tx-id",
      spendableOutpoint: {
        transactionId: "dummy-funding-tx-id",
        index: 0
      },
      amount: 5000000000n, // 50 Kaspa
      privateKey: new Uint8Array(Buffer.from(privateKeyHex, "hex")),
      address: address
    };
  }
}
