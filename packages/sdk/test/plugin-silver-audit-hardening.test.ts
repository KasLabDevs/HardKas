import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HardkasError, parseSilAbiArtifact } from "@hardkas/core";
import { Hardkas, HardkasSilver } from "../src/index.js";

describe("Priority 7 · PluginManager & HardkasSilver.p2sh hardening", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-plugin-silver-"));
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("PluginManager stamps hashVersion/contentHash on PluginDecision & PluginHookFailure and keeps after-hooks non-fatal", async () => {
    const sdk = await Hardkas.create({ cwd: ws, network: "simulated", autoBootstrap: true });
    (sdk.sdkConfig as any).plugins = [
      {
        name: "blocker-and-logger",
        version: "1.0.0",
        hooks: {
          onBeforeArtifactWrite: async () => {
            throw new HardkasError("PLUGIN_ACTION_BLOCKED", "blocked by policy plugin");
          },
          onArtifactWritten: async () => {
            throw new Error("after-hook boom");
          }
        }
      }
    ];
    sdk.plugins.loadPlugins();

    await expect(
      sdk.plugins.onBeforeArtifactWrite({ artifact: { schema: "x" }, options: {} })
    ).rejects.toMatchObject({ code: "PLUGIN_ACTION_BLOCKED" });

    // Non-fatal after-hook failure writes PluginHookFailure artifact with valid hashVersion without crashing
    await expect(
      sdk.plugins.onArtifactWritten({ artifact: { schema: "x" }, path: path.join(ws, "a.json") })
    ).resolves.toBeUndefined();

    const miscDir = path.join(ws, ".hardkas", "artifacts", "misc");
    const files = fs.readdirSync(miscDir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const file of files) {
      const parsed = JSON.parse(fs.readFileSync(path.join(miscDir, file), "utf-8"));
      expect(typeof parsed.hashVersion).toBe("number");
      expect(typeof parsed.contentHash).toBe("string");
    }
  });

  it("silver.p2sh supports testnet-10 while still rejecting mainnet", async () => {
    const sdk = await Hardkas.create({ cwd: ws, network: "simnet", autoBootstrap: true });
    const silver = new HardkasSilver(sdk);
    const abiPath = path.resolve(__dirname, "../../accounts/test/fixtures/v1-engine/phase2/twooftwo.artifact.json");
    const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(abiPath, "utf-8")));
    const compiled = { artifact } as any;

    const tn = silver.p2sh(compiled, { network: "testnet-10" });
    expect(tn.address.startsWith("kaspatest:")).toBe(true);
    expect(tn.contract).toBe("TwoOfTwo");

    expect(() => silver.p2sh(compiled, { network: "mainnet" })).toThrow(/SILVERSCRIPT_MAINNET_NOT_ENABLED/);
    expect(() => silver.p2sh(compiled, { network: "kaspa-mainnet" })).toThrow(/SILVERSCRIPT_MAINNET_NOT_ENABLED/);
  });
});
