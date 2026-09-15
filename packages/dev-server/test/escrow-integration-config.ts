// Resolves the [conditional integration] escrow config from local dev accounts.
// The global-setup funds `alice` (dev account #0) and starts a background miner.
// Here we materialize buyer=alice, seller=bob, arbiter=charlie so the dev-server
// signer lookup (by x-only key) actually finds them.
import { getOrCreateDevAccount, loadKaspaWasm } from "@hardkas/accounts";

export interface EscrowIntegrationConfig {
  buyer: { publicKeyHex: string };
  seller: { publicKeyHex: string };
  arbiter: { publicKeyHex: string };
  buyerDestinationSpk: string;
  sellerDestinationSpk: string;
  refundAmount: string;
  releaseAmount: string;
}

let cached: Promise<EscrowIntegrationConfig> | undefined;

export function resolveEscrowIntegrationConfig(): Promise<EscrowIntegrationConfig> {
  if (!cached) cached = resolve();
  return cached;
}

async function resolve(): Promise<EscrowIntegrationConfig> {
  const k = await loadKaspaWasm();
  const cwd = process.cwd();
  const [alice, bob, charlie] = await Promise.all([
    getOrCreateDevAccount(cwd, 0, "alice"),
    getOrCreateDevAccount(cwd, 1, "bob"),
    getOrCreateDevAccount(cwd, 2, "charlie")
  ]);
  const xOnly = (acc: { privateKey: string }) => String(new k.PrivateKey(acc.privateKey).toPublicKey().toXOnlyPublicKey().toString());
  const p2pk = (acc: { privateKey: string }) => "20" + xOnly(acc) + "ac";
  return {
    buyer: { publicKeyHex: xOnly(alice) },
    seller: { publicKeyHex: xOnly(bob) },
    arbiter: { publicKeyHex: xOnly(charlie) },
    buyerDestinationSpk: p2pk(alice),
    sellerDestinationSpk: p2pk(bob),
    refundAmount: "100000000",
    releaseAmount: "100000000"
  };
}
