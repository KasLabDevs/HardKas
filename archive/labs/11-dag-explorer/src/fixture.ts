// No external imports needed, purely synthetic for friction discovery

export interface SimulatedBlock {
  hash: string;
  parents: string[];
  transactions: { id: string, payload: any }[];
  blueScore: number;
}

export async function createSyntheticDag() {
  const blocks: SimulatedBlock[] = [];
  
  // Custom helper to quickly mine a block on top of specific parents
  async function mineBlock(hash: string, parents: string[], transactions: any[] = []) {
    // In HardKAS Simulator, we usually use the builder or direct engine methods, 
    // but for this lab, we will just manually construct the raw mock objects to feed into our store
    // because we want to test our manual logic, not necessarily the simulator's internal perfection.
    const block: SimulatedBlock = {
      hash,
      parents,
      transactions
    };
    blocks.push(block);
    return block;
  }

  // Genesis
  await mineBlock("genesis", []);

  // A and B on top of Genesis
  await mineBlock("block-A", ["genesis"]);
  await mineBlock("block-B", ["genesis"]);

  // C and D on top of A
  await mineBlock("block-C", ["block-A"], [{ id: "tx-payment-1", payload: {} }]);
  await mineBlock("block-D", ["block-A"], [{ id: "tx-conflict-1", payload: {} }]);

  // E on top of B
  await mineBlock("block-E", ["block-B"], [{ id: "tx-conflict-1", payload: {} }]); // Conflict!

  // F merges C and E
  await mineBlock("block-F", ["block-C", "block-E"], [{ id: "tx-merged-1", payload: {} }]);

  // G is an orphan/disconnected block
  await mineBlock("block-G", ["unknown-parent"], [{ id: "tx-orphan", payload: {} }]);

  return blocks;
}
