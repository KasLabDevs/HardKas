import { describe, it, expect } from "vitest";
import { KaspaSdkKeyGenerator } from "../src/kaspa-sdk-keygen.js";

// E39 · `accounts real generate` on a machine without the pinned SDK reported
// WALLET_BACKEND_UNAVAILABLE and suggested `accounts real import`. The loader's own error already
// names the command that fixes it; it must reach the user unchanged.

const failingLoader = (code: string | undefined, message: string) => async () => {
  const error: any = new Error(message);
  if (code) error.code = code;
  throw error;
};

describe("E39 · key generation reports a missing or altered SDK as it is", () => {
  it("passes WASM_TOOLCHAIN_NOT_INSTALLED through with its install command", async () => {
    const generator = new KaspaSdkKeyGenerator({
      sdkLoader: failingLoader(
        "WASM_TOOLCHAIN_NOT_INSTALLED",
        "WASM_TOOLCHAIN_NOT_INSTALLED: kaspa-wasm 2.1.0 is not installed at /home/x/.hardkas/toolchains/kaspa-wasm/2.1.0.\nInstall it with: hardkas toolchain install kaspa-wasm"
      )
    });
    await expect(generator.generateAccount()).rejects.toMatchObject({
      code: "WASM_TOOLCHAIN_NOT_INSTALLED",
      message: expect.stringContaining("hardkas toolchain install kaspa-wasm")
    });
  });

  it("passes WASM_TOOLCHAIN_INTEGRITY_FAILED through", async () => {
    const generator = new KaspaSdkKeyGenerator({
      sdkLoader: failingLoader("WASM_TOOLCHAIN_INTEGRITY_FAILED", "WASM_TOOLCHAIN_INTEGRITY_FAILED: kaspa.js: sha256 does not match the pin")
    });
    await expect(generator.generateAccount()).rejects.toMatchObject({ code: "WASM_TOOLCHAIN_INTEGRITY_FAILED" });
  });

  it("reports any other load failure as WALLET_BACKEND_UNAVAILABLE with its cause and a real next step", async () => {
    const generator = new KaspaSdkKeyGenerator({ sdkLoader: failingLoader(undefined, "wasm instantiate failed") });
    const error: any = await generator.generateAccount().catch((e) => e);
    expect(error.code).toBe("WALLET_BACKEND_UNAVAILABLE");
    expect(error.message).toContain("wasm instantiate failed");
    expect(error.message).toContain("hardkas toolchain status");
    expect(error.message).not.toContain("accounts real import");
  });
});
