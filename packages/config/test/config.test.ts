import { describe, it, expect } from "vitest";
import { defineHardkasConfig } from "../src/define";
import { resolveNetworkTarget } from "../src/resolve";
import { DEFAULT_HARDKAS_CONFIG } from "../src/defaults";
import { loadHardkasConfig } from "../src/load";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("config", () => {
  it("defineHardkasConfig should return the config object", () => {
    const config = { defaultNetwork: "devnet" };
    expect(defineHardkasConfig(config)).toBe(config);
  });

  it("resolveNetworkTarget should use defaultNetwork if no network is passed", () => {
    const config = {
      defaultNetwork: "devnet",
      networks: {
        devnet: { kind: "kaspa-node" as const, network: "devnet" as const }
      }
    };
    const resolved = resolveNetworkTarget({ config });
    expect(resolved.name).toBe("devnet");
    expect(resolved.target.kind).toBe("kaspa-node");
  });

  it("resolveNetworkTarget should use simulated as default fallback", () => {
    const resolved = resolveNetworkTarget({ config: {} });
    expect(resolved.name).toBe("simulated");
    expect(resolved.target.kind).toBe("simulated");
  });

  it("resolveNetworkTarget should support simulated network explicitly", () => {
    const resolved = resolveNetworkTarget({ config: {}, network: "simulated" });
    expect(resolved.name).toBe("simulated");
    expect(resolved.target.kind).toBe("simulated");
  });

  it("resolveNetworkTarget should throw for unknown network", () => {
    expect(() => resolveNetworkTarget({ config: {}, network: "non-existent" })).toThrow(
      /Unknown HardKAS network 'non-existent'/
    );
  });

  it("loadHardkasConfig should deep merge custom config with default config", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-config-test-"));
    const configPath = path.join(tempDir, "hardkas.config.ts");

    fs.writeFileSync(
      configPath,
      `
export default {
  defaultNetwork: "custom-net",
  networks: {
    "custom-net": { kind: "simulated" }
  },
  accounts: {
    alice: { kind: "simulated", address: "kaspa:custom_alice" }
  }
};
    `
    );

    try {
      const loaded = await loadHardkasConfig({
        cwd: tempDir,
        configPath: "hardkas.config.ts"
      });

      // Verify custom values are preserved/overridden
      expect(loaded.config.defaultNetwork).toBe("custom-net");
      expect(loaded.config.networks?.["custom-net"]).toBeDefined();
      expect(loaded.config.accounts?.alice?.address).toBe("kaspa:custom_alice");

      // Verify default values are merged
      expect(loaded.config.networks?.simnet).toBeDefined();
      expect(loaded.config.networks?.mainnet).toBeDefined();
      expect(loaded.config.accounts?.bob).toBeDefined();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("loadHardkasConfig should correctly resolve an external consumer config", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-external-consumer-"));
    const configPath = path.join(tempDir, "hardkas.config.ts");

    fs.writeFileSync(
      configPath,
      `
export default {
  defaultNetwork: "consumer-net"
};
    `
    );

    try {
      const loaded = await loadHardkasConfig({
        cwd: tempDir,
        workspaceRoot: tempDir
      });

      expect(loaded.config.defaultNetwork).toBe("consumer-net");
      expect(loaded.path).toBe(configPath);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
