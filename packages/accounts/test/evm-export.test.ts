import { describe, it, expect } from "vitest";
import { prepareEvmAccountExport } from "../src/evm-export";
import { HardkasAccount } from "../src/types";

describe("EVM Account Export Security Gates", () => {
  const evmAccount: HardkasAccount = {
    name: "alice-evm",
    kind: "evm-private-key",
    address: "0x1234567890123456789012345678901234567890"
  };

  const kaspaAccount: HardkasAccount = {
    name: "alice-kaspa",
    kind: "kaspa-private-key",
    address: "kaspasim:qz..."
  };

  it("should fail if network is mainnet", async () => {
    await expect(prepareEvmAccountExport(evmAccount, "mainnet"))
      .rejects.toThrow(/NOT allowed on network "mainnet"/);
  });

  it("should fail if network is testnet", async () => {
    await expect(prepareEvmAccountExport(evmAccount, "testnet-10"))
      .rejects.toThrow(/NOT allowed on network "testnet-10"/);
  });

  it("should succeed on simnet", async () => {
    const result = await prepareEvmAccountExport(evmAccount, "simnet");
    expect(result.address).toBe(evmAccount.address);
    expect(result.isSecret).toBe(false);
  });

  it("should fail if account is not EVM kind", async () => {
    await expect(prepareEvmAccountExport(kaspaAccount, "simnet"))
      .rejects.toThrow(/is not an EVM\/L2 account/);
  });

  it("should fail if private key is requested but missing", async () => {
    await expect(prepareEvmAccountExport(evmAccount, "simnet", { includeSecret: true }))
      .rejects.toThrow(/could not be retrieved/);
  });

  it("should include private key if present and requested", async () => {
    const accountWithKey = { ...evmAccount, privateKey: "abcdef123456" };
    const result = await prepareEvmAccountExport(accountWithKey as any, "simnet", { includeSecret: true });
    expect(result.privateKey).toBe("0xabcdef123456");
    expect(result.isSecret).toBe(true);
  });
});
