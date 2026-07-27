import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

export interface MinedBlockResult {
  hash: string;
}

export interface SimnetMiningDriver {
  mineBlock(options?: {
    payAddress?: string;
    includeTransactionIds?: readonly string[];
    timeoutMs?: number;
  }): Promise<MinedBlockResult>;

  mineBlocks(
    count: number,
    options?: {
      payAddress?: string;
      timeoutMs?: number;
    },
  ): Promise<readonly MinedBlockResult[]>;
}

export class SimnetMiningDriverImpl implements SimnetMiningDriver {
  constructor(private client: JsonWrpcKaspaClient) {}

  async mineBlock(options?: {
    payAddress?: string;
    includeTransactionIds?: readonly string[];
    timeoutMs?: number;
  }): Promise<MinedBlockResult> {
    const payAddress = options?.payAddress || "kaspasim:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqx0r8j";
    
    // Obtenemos el template del bloque
    // Note: rusty-kaspad wRPC JSON requires:
    //   - kaspasim: prefix for simnet addresses (not simnet:)
    //   - extraData as byte array [] (not string "")
    const templateRes = await this.client.call("getBlockTemplateRequest", {
      payAddress,
      extraData: []
    }) as any;
    
    const blockMessage = templateRes.blockMessage || templateRes.block;
    
    // Modificamos el bloque si debemos forzar ciertas transacciones (simplificado para Simnet Testing)
    
    const submitRes = await this.client.call("submitBlockRequest", {
      block: blockMessage,
      allowNonDAABlocks: false
    }) as any;
    
    if (submitRes.rejectReason) {
      throw new Error(`Block rejected: ${submitRes.rejectReason}`);
    }

    return {
      hash: blockMessage.header.hashMerkleRoot || "dummy-hash" // This is an approximation
    };
  }

  async mineBlocks(
    count: number,
    options?: {
      payAddress?: string;
      timeoutMs?: number;
    }
  ): Promise<readonly MinedBlockResult[]> {
    const results: MinedBlockResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push(await this.mineBlock(options));
    }
    return results;
  }
}

