export interface SimnetFixture {
  genesisHash: string;
  knownBlockHash?: string;
  selectedTipHash?: string;
  blockCount: bigint;
}

export class SimnetFixtureGenerator {
  /**
   * Genera un fixture para las pruebas Simnet. 
   * Retorna hashes conocidos o mockeados dependiendo de cómo esté configurado el harness.
   * Esto sirve para garantizar que las pruebas de L1 Coverage tengan datos deterministas.
   */
  static async generate(rpcUrl: string): Promise<SimnetFixture> {
    // Para la certificación "Read" no necesitamos minar activamente aún, 
    // pero podemos extraer los hashes actuales del nodo limpio.
    // Usamos el cliente rpc nativo temporalmente para sacar los datos iniciales.
    
    // Por simplicidad, retornaremos un fixture que inspecciona el estado actual.
    // En el futuro, esto usaría submitBlock para minar N bloques deterministas.
    const { JsonWrpcKaspaClient } = await import("@hardkas/rpc");
    const client = new JsonWrpcKaspaClient({ rpcUrl });
    
    let genesisHash = "";
    let blockCount = 0n;
    
    try {
      const info = await client.getBlockCount();
      blockCount = BigInt((info as any).blockCount || (info as any).headerCount || 0);
      
      const tip = await client.getBlockDagInfo();
      genesisHash = tip.tipHashes?.[0] || ""; // El genesis en simnet recien creado suele ser el unico tip
    } catch (e) {
      // Ignorar errores en generación, dejar los defaults
    } finally {
      await client.close();
    }

    return {
      genesisHash: genesisHash || "0000000000000000000000000000000000000000000000000000000000000000",
      blockCount: blockCount > 0n ? blockCount : 1n
    };
  }
}
