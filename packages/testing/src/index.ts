import type { NetworkId } from "@hardkas/core";
import { MockKaspaRpcClient } from "@hardkas/kaspa-rpc";
import { createDeterministicAccounts } from "@hardkas/localnet";
import { createMockUtxo } from "@hardkas/tx-builder";

export interface TestWallet {
  readonly name: string;
  readonly address: string;
}

export interface HardkasTestContext {
  readonly wallets: {
    readonly alice: TestWallet;
    readonly bob: TestWallet;
    readonly carol: TestWallet;
    readonly faucet: TestWallet;
  };
  readonly rpc: MockKaspaRpcClient;
  readonly faucet: {
    fund(address: string, amountSompi: bigint): Promise<void>;
  };
  reset(): Promise<void>;
}

export async function createHardkasTestContext(): Promise<HardkasTestContext> {
  const rpc = new MockKaspaRpcClient("simnet" as NetworkId);

  const accounts = createDeterministicAccounts({
    count: 4,
    initialBalanceSompi: 0n
  });

  const alice = accounts[0];
  const bob = accounts[1];
  const carol = accounts[2];

  if (!alice || !bob || !carol) {
    throw new Error("Failed to create deterministic test accounts.");
  }

  const wallets = {
    alice: { name: alice.name, address: alice.address },
    bob: { name: bob.name, address: bob.address },
    carol: { name: carol.name, address: carol.address },
    faucet: { name: "faucet", address: "kaspa:sim_faucet" }
  } as const;

  return {
    wallets,
    rpc,
    faucet: {
      async fund(address: string, amountSompi: bigint): Promise<void> {
        rpc.setUtxos(address, [
          createMockUtxo({
            address,
            amountSompi,
            index: 0
          })
        ]);
      }
    },
    async reset(): Promise<void> {
      rpc.setUtxos(wallets.alice.address, []);
      rpc.setUtxos(wallets.bob.address, []);
      rpc.setUtxos(wallets.carol.address, []);
    }
  };
}

export const hardkas = {
  localnet: createHardkasTestContext
};
