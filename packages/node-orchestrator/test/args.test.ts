import { describe, it, expect } from "vitest";
import { buildKaspadArgs } from "../src/args";
import { resolveRuntimeConfig } from "../src/paths";
import type { KaspaNodeConfig } from "../src/types";

describe("node-orchestrator args", () => {
  it("should add --devnet for devnet network", () => {
    const config: KaspaNodeConfig = { network: "devnet" };
    const runtime = resolveRuntimeConfig(config);
    const args = buildKaspadArgs(config, runtime);
    expect(args).toContain("--devnet");
    expect(args).not.toContain("--testnet");
  });

  it("should add --testnet and --netsuffix for testnet-10", () => {
    const config: KaspaNodeConfig = { network: "testnet-10" };
    const runtime = resolveRuntimeConfig(config);
    const args = buildKaspadArgs(config, runtime);
    expect(args).toContain("--testnet");
    expect(args).toContain("--netsuffix=10");
  });

  it("should add --testnet and --netsuffix for testnet-12", () => {
    const config: KaspaNodeConfig = { network: "testnet-12" };
    const runtime = resolveRuntimeConfig(config);
    const args = buildKaspadArgs(config, runtime);
    expect(args).toContain("--testnet");
    expect(args).toContain("--netsuffix=12");
  });

  it("should not add --testnet or --devnet for mainnet", () => {
    const config: KaspaNodeConfig = { network: "mainnet" };
    const runtime = resolveRuntimeConfig(config);
    const args = buildKaspadArgs(config, runtime);
    expect(args).not.toContain("--testnet");
    expect(args).not.toContain("--devnet");
  });

  it("should add --utxoindex if enabled", () => {
    const config: KaspaNodeConfig = { network: "devnet", enableUtxoIndex: true };
    const runtime = resolveRuntimeConfig(config);
    const args = buildKaspadArgs(config, runtime);
    expect(args).toContain("--utxoindex");
  });

  it("should reflect custom rpcListen in args", () => {
    const config: KaspaNodeConfig = { network: "devnet", rpcListen: "0.0.0.0:1234" };
    const runtime = resolveRuntimeConfig(config);
    const args = buildKaspadArgs(config, runtime);
    expect(args).toContain("--rpclisten-json=0.0.0.0:1234");
  });
});
