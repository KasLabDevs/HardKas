export class MockRpcProvider {
  private utxos = new Map<string, any[]>();
  
  public capabilities = ["LEGACY_RECOVERY"];

  setUtxos(address: string, utxoList: any[]) {
    this.utxos.set(address, utxoList);
  }

  async getUtxosByAddresses(args: { addresses: string[] }) {
    const result = [];
    for (const address of args.addresses) {
      if (this.utxos.has(address)) {
        result.push(...this.utxos.get(address)!);
      }
    }
    return { entries: result };
  }

  async getBlockDagInfo() {
    return { virtualDaaScore: "100", sink: "hash-1" };
  }
  
  async getFeeEstimate() {
    return { priorityBucket: { feePerMass: "1" }, normalBucket: { feePerMass: "1" }, lowBucket: { feePerMass: "1" } };
  }

  async getServerInfo() {
    return { networkId: "simnet" };
  }
  
  async getCurrentNetwork() {
    return { networkId: "simnet" };
  }
  
  async getSyncStatus() {
    return { isSynced: true };
  }

  // Ensure it implements KaspaRpcProvider interface methods that might be called
  async connect() {}
  async disconnect() {}
  on() {}
  off() {}
}
