import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { KASPA_WASM_REFERENCE, getToolchainInstallDir, loadManagedKaspaWasmSync } from "../src/index.js";

// E39 · compatibility: a HardKAS home that still holds the kaspa-wasm of an earlier release must
// never be used by a release that pins another version. The loader looks only in the directory
// of the pinned version and says exactly what to install.

describe("E39 · only the pinned kaspa-wasm is ever loaded", () => {
  let home: string;
  let previousHome: string | undefined;

  beforeEach(() => {
    previousHome = process.env.HARDKAS_HOME;
    home = fs.mkdtempSync(path.join(os.tmpdir(), "hk-e39-pin-"));
    process.env.HARDKAS_HOME = home;
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.HARDKAS_HOME;
    else process.env.HARDKAS_HOME = previousHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("with only another version installed, loading fails and names the pinned version, its directory and the command", () => {
    const earlier = "2.0.1";
    expect(KASPA_WASM_REFERENCE.version).not.toBe(earlier);
    const earlierDir = path.join(home, "toolchains", "kaspa-wasm", earlier);
    fs.mkdirSync(earlierDir, { recursive: true });
    fs.writeFileSync(path.join(earlierDir, "kaspa.js"), "module.exports = { earlierRelease: true };\n");

    let error: any;
    try {
      loadManagedKaspaWasmSync();
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe("WASM_TOOLCHAIN_NOT_INSTALLED");
    expect(error.message).toContain(`kaspa-wasm ${KASPA_WASM_REFERENCE.version} is not installed at ${getToolchainInstallDir(KASPA_WASM_REFERENCE)}`);
    expect(error.message).toContain("hardkas toolchain install kaspa-wasm");
    expect(error.message).not.toContain(earlierDir);
  });
});
