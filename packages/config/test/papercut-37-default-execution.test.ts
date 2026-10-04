import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_HARDKAS_CONFIG } from "../src/defaults";
import { loadHardkasConfig } from "../src/load";
import { resolveExecutionTarget, resolveNewIntentTarget } from "../src/resolve";

// PAPERCUTS #37 (2026-10-04): the built-in configuration declares its default target through the
// `execution` contract. Before, it declared the deprecated `defaultNetwork` and nothing else, so a
// workspace that never wrote that key still resolved through the deprecated path (and could be
// warned about a key it never wrote). A user config that really carries `defaultNetwork` keeps its
// legacy resolution and remains the only one the resolver warns about.

const SIMULATOR = { mode: "simulator", domain: "kaspa-l1", network: "simulated" };

function withConfigFile(body: string, fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-papercut-37-"));
  fs.writeFileSync(path.join(dir, "hardkas.config.ts"), body);
  return fn(dir).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
}

function spyWarn() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

describe("PAPERCUTS #37 · the built-in default declares its target through `execution`", () => {
  it("DEFAULT_HARDKAS_CONFIG resolves through the simulator execution target and is never warned about", () => {
    expect(DEFAULT_HARDKAS_CONFIG.execution).toMatchObject({ default: "simulator" });
    const warn = spyWarn();
    try {
      const resolved = resolveExecutionTarget({ config: DEFAULT_HARDKAS_CONFIG });
      expect(resolved.name).toBe("simulated");
      expect(resolved.execution).toEqual(SIMULATOR);
      expect(resolveNewIntentTarget({ config: DEFAULT_HARDKAS_CONFIG })).toEqual(SIMULATOR);
      // the canonical localnet is a named target of the default too
      expect(resolveExecutionTarget({ config: DEFAULT_HARDKAS_CONFIG, targetName: "localnet" }).name).toBe("simnet");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("the legacy mirror equals the default target's network (it exists only for the unmigrated readers)", () => {
    const execution = DEFAULT_HARDKAS_CONFIG.execution as { default: string; targets: Record<string, { network: string }> };
    expect(DEFAULT_HARDKAS_CONFIG.defaultNetwork).toBe(execution.targets[execution.default]!.network);
  });

  it("a workspace without hardkas.config.ts gets the execution default, without a warning", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-papercut-37-bare-"));
    const warn = spyWarn();
    try {
      const loaded = await loadHardkasConfig({ cwd: dir, workspaceRoot: dir });
      expect(loaded.path).toBeUndefined();
      expect(loaded.config.execution).toMatchObject({ default: "simulator" });
      const resolved = resolveExecutionTarget({ config: loaded.config });
      expect(resolved.name).toBe("simulated");
      expect(resolved.execution).toEqual(SIMULATOR);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a config that declares neither key gets the execution default, without a warning", () =>
    withConfigFile(`export default { networks: { extra: { kind: "simulated" } } };\n`, async (dir) => {
      const warn = spyWarn();
      try {
        const loaded = await loadHardkasConfig({ cwd: dir, workspaceRoot: dir });
        expect(loaded.config.execution).toMatchObject({ default: "simulator" });
        expect(loaded.config.networks?.extra).toBeDefined();
        const resolved = resolveExecutionTarget({ config: loaded.config });
        expect(resolved.execution).toEqual(SIMULATOR);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    }));

  it("a legacy config that declares defaultNetwork keeps resolving through it, and is the one warned", () =>
    withConfigFile(`export default { defaultNetwork: "devnet" };\n`, async (dir) => {
      const warn = spyWarn();
      try {
        const loaded = await loadHardkasConfig({ cwd: dir, workspaceRoot: dir });
        // the built-in execution default must not shadow the user's legacy key
        expect(loaded.config.execution).toBeUndefined();
        expect(loaded.config.defaultNetwork).toBe("devnet");
        const resolved = resolveExecutionTarget({ config: loaded.config });
        expect(resolved.name).toBe("devnet");
        expect(resolved.execution).toEqual({ mode: "localnet", domain: "kaspa-l1", network: "devnet" });
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toMatch(/DEPRECATED: 'defaultNetwork: "devnet"'/);
      } finally {
        warn.mockRestore();
      }
    }));

  it("a config with its own execution contract is untouched", () =>
    withConfigFile(
      `export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n`,
      async (dir) => {
        const warn = spyWarn();
        try {
          const loaded = await loadHardkasConfig({ cwd: dir, workspaceRoot: dir });
          expect(loaded.config.execution).toMatchObject({ default: "localnet" });
          const resolved = resolveExecutionTarget({ config: loaded.config });
          expect(resolved.name).toBe("simnet");
          expect(resolved.execution.mode).toBe("localnet");
          expect(warn).not.toHaveBeenCalled();
        } finally {
          warn.mockRestore();
        }
      }
    ));
});
