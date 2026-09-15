import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KASPA_WASM_REFERENCE, getToolchainInstallDir } from "@hardkas/core";
import { getKaspaSigningBackendStatus, loadKaspaWasm, loadKaspaWasmSync } from "../src/signer-backend.js";

/**
 * The managed provider loads only the pinned official SDK. It must never fall
 * back to another SDK when the install is missing or does not match the pin.
 */
describe("loadKaspaWasm({ provider: 'managed' })", () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(async () => {
    previousHome = process.env.HARDKAS_HOME;
    home = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-wasm-home-"));
    process.env.HARDKAS_HOME = home;
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.HARDKAS_HOME;
    else process.env.HARDKAS_HOME = previousHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  it("fails with WASM_TOOLCHAIN_NOT_INSTALLED when nothing is installed", async () => {
    await expect(loadKaspaWasm({ provider: "managed" })).rejects.toMatchObject({
      code: "WASM_TOOLCHAIN_NOT_INSTALLED"
    });
  });

  it("uses the managed toolchain by default, with no fallback to another SDK", async () => {
    await expect(loadKaspaWasm()).rejects.toMatchObject({ code: "WASM_TOOLCHAIN_NOT_INSTALLED" });
    expect(() => loadKaspaWasmSync()).toThrow(/WASM_TOOLCHAIN_NOT_INSTALLED/);
  });

  it("reports a missing toolchain as unavailable in the backend status", async () => {
    const status = await getKaspaSigningBackendStatus();
    expect(status.available).toBe(false);
    expect(status.error).toMatch(/hardkas toolchain install kaspa-wasm/);
  });

  it("fails with WASM_TOOLCHAIN_INTEGRITY_FAILED when the install does not match the pin", async () => {
    const dir = getToolchainInstallDir(KASPA_WASM_REFERENCE, home);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, KASPA_WASM_REFERENCE.entry), "module.exports = { version: () => 'fake' };");

    await expect(loadKaspaWasm({ provider: "managed" })).rejects.toMatchObject({
      code: "WASM_TOOLCHAIN_INTEGRITY_FAILED"
    });
  });
});
