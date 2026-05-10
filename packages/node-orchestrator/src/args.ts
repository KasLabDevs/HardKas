import type { KaspaNodeConfig, KaspaNodeRuntimeConfig } from "./types";

export function buildKaspadArgs(
  config: KaspaNodeConfig,
  runtime: KaspaNodeRuntimeConfig
): string[] {
  const args: string[] = [
    `--appdir=${runtime.dataDir}`,
    `--rpclisten-json=${runtime.rpcListen}`
  ];

  if (config.network === "devnet") {
    args.push("--devnet");
  } else if (config.network.startsWith("testnet")) {
    args.push("--testnet");
    const suffix = config.network.split("-")[1];
    if (suffix) {
      args.push(`--netsuffix=${suffix}`);
    }
  }

  if (config.p2pListen) {
    args.push(`--listen=${config.p2pListen}`);
  }

  if (config.enableUtxoIndex) {
    args.push("--utxoindex");
  }

  if (config.extraArgs) {
    args.push(...config.extraArgs);
  }

  return args;
}
