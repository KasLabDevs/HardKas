import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import { HardkasError } from "@hardkas/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Agent-Safe Mode Policies", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-agent-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should block network actions if allowNetwork is false", async () => {
    const sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      policy: { allowNetwork: false }
    });

    expect(() => sdk.enforcePolicy("network")).toThrowError(HardkasError);
    expect(() => sdk.enforcePolicy("network")).toThrowError(/allowNetwork/);
  });

  it("should block mainnet actions if allowMainnet is false", async () => {
    const sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      policy: { allowMainnet: false }
    });

    expect(() => sdk.enforcePolicy("mainnet")).toThrowError(HardkasError);
    expect(() => sdk.enforcePolicy("mainnet")).toThrowError(/allowMainnet/);
  });

  it("should allow mainnet actions if explicitly allowed by policy", async () => {
    const sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      policy: { allowMainnet: true }
    });

    expect(() => sdk.enforcePolicy("mainnet")).not.toThrow();
  });

  it("should block mutations if requireDryRun is true", async () => {
    const sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "agent",
      policy: { requireDryRun: true }
    });

    expect(() => sdk.enforcePolicy("mutation")).toThrowError(HardkasError);
    expect(() => sdk.enforcePolicy("mutation")).toThrowError(/requireDryRun/);
  });

  it("should default to developer mode without restrictions", async () => {
    const sdk = await Hardkas.open({ cwd: tmpDir, mode: "developer" });

    expect(() => sdk.enforcePolicy("network")).not.toThrow();
    expect(() => sdk.enforcePolicy("mainnet")).not.toThrow();
    expect(() => sdk.enforcePolicy("mutation")).not.toThrow();
  });
});
