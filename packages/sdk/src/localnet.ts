import { Hardkas } from "./index.js";

/**
 * HardKAS Localnet Simulation Module
 */
export class HardkasLocalnet {
  constructor(private sdk: Hardkas) {}

  /**
   * Status check for the localnet simulation.
   */
  async isAlive(): Promise<boolean> {
    try {
      const info = await this.sdk.rpc.getInfo();
      return info.isSynced === true;
    } catch {
      return false;
    }
  }

  /**
   * Future: control localnet process/container from here.
   */
  async start(): Promise<void> {
    console.log("Localnet control via SDK is not yet implemented.");
    console.log("Please use 'hardkas localnet' CLI command.");
  }

  /**
   * Resets the localnet state (simulated or node).
   */
  async reset(): Promise<void> {
    console.log("Localnet reset via SDK is not yet implemented.");
  }
}
