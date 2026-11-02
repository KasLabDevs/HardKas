// Real L2 artifacts for CLI tests: genuinely signed raw transactions and real content hashes,
// so the integrity / chain / fee checks of `l2 tx sign|send` are exercised, not bypassed.
import { privateKeyToAccount } from "viem/accounts";
import { keccak256 } from "viem";
import {
  ARTIFACT_SCHEMAS,
  HARDKAS_VERSION,
  CURRENT_HASH_VERSION,
  calculateContentHash,
  createIgraPlanId,
  createIgraSignedId
} from "@hardkas/artifacts";

// Well-known public Anvil/Hardhat key #0 (no real funds).
export const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const OTHER_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

export async function signRaw(opts: {
  chainId: number;
  nonce?: number;
  gas?: bigint;
  gasPrice?: bigint;
  to?: `0x${string}`;
  value?: bigint;
}): Promise<`0x${string}`> {
  return privateKeyToAccount(TEST_PK).signTransaction({
    type: "legacy",
    chainId: opts.chainId,
    nonce: opts.nonce ?? 7,
    gas: opts.gas ?? 21000n,
    gasPrice: opts.gasPrice ?? 1_000_000_000n,
    to: opts.to ?? (OTHER_ADDR as `0x${string}`),
    value: opts.value ?? 0n,
    data: "0x"
  });
}

export function makePlan(opts: { l2Network: string; chainId: number; request?: Record<string, string> }): any {
  const a: any = {
    schema: ARTIFACT_SCHEMAS.IGRA_TX_PLAN,
    hardkasVersion: HARDKAS_VERSION,
    networkId: opts.l2Network,
    mode: "l2-rpc",
    createdAt: "2026-10-30T00:00:00.000Z",
    planId: "",
    l2Network: opts.l2Network,
    chainId: opts.chainId,
    request: {
      from: TEST_ADDR,
      to: OTHER_ADDR,
      data: "0x",
      valueWei: "0",
      gasLimit: "21000",
      gasPriceWei: "1000000000",
      nonce: "7",
      ...(opts.request ?? {})
    },
    estimatedGas: "21000",
    estimatedFeeWei: "21000000000000",
    status: "built"
  };
  a.hashVersion = CURRENT_HASH_VERSION;
  const h = calculateContentHash(a, CURRENT_HASH_VERSION);
  a.planId = createIgraPlanId(h);
  a.contentHash = h;
  return a;
}

export function makeSigned(opts: { l2Network: string; chainId: number; rawTransaction: `0x${string}` }): any {
  const a: any = {
    schema: ARTIFACT_SCHEMAS.IGRA_SIGNED_TX,
    hardkasVersion: HARDKAS_VERSION,
    networkId: opts.l2Network,
    mode: "l2-rpc",
    createdAt: "2026-10-30T00:00:00.000Z",
    signedId: "",
    sourcePlanId: "p1",
    l2Network: opts.l2Network,
    chainId: opts.chainId,
    rawTransaction: opts.rawTransaction,
    txHash: keccak256(opts.rawTransaction),
    status: "signed"
  };
  a.hashVersion = CURRENT_HASH_VERSION;
  const h = calculateContentHash(a, CURRENT_HASH_VERSION);
  a.signedId = createIgraSignedId(h);
  a.contentHash = h;
  return a;
}
