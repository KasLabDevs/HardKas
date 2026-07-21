import { SimulatedBlock } from '../fixture.js';

export class ExplorerStore {
  private blocks = new Map<string, SimulatedBlock>();

  public save(block: SimulatedBlock) {
    this.blocks.set(block.hash, block);
  }

  public get(hash: string): SimulatedBlock | undefined {
    return this.blocks.get(hash);
  }

  public getAll(): SimulatedBlock[] {
    return Array.from(this.blocks.values());
  }
}
