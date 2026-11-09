import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CANONICAL_LOCALNET,
  CANONICAL_NODE_EXPECTATION,
  SIMULATOR_NODE_EXPECTATION,
  evaluateNodeIdentity,
  type NodeIdentityRecord
} from "@hardkas/core";

/*
 * HK-01 / CA-EXP-01b (audit 6-nov-2026): with HARDKAS_SIMULATOR=1 and the simulator on 18210, `silver doctor` reported
 * "undefined rusty-kaspad 2.1.0" and `capabilities` announced Toccata and covenants. The readiness now requires a
 * verified rusty-kaspad, whatever the environment. Identities are simulated observations (no Docker, no node).
 */

const identity = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@hardkas/node-runner", () => ({
  verifyNodeIdentity: vi.fn(async () => identity.current)
}));

const { probeSilverReadiness, HardkasCapabilitiesApi } = await import("../src/capabilities.js");

const SIM_ON_18210 = { url: "ws://127.0.0.1:18210", networkId: "simnet", serverVersion: CANONICAL_LOCALNET.serverVersion, isSynced: true };
const CONTAINER = {
  name: CANONICAL_LOCALNET.containerName,
  id: "abc",
  running: true,
  imageId: CANONICAL_LOCALNET.imageDigest,
  repoDigests: [],
  publishedPorts: [{ containerPort: "18210/tcp", hostIp: "127.0.0.1", hostPort: 18210 }]
};

describe("capabilities never announce Toccata/covenants for a node that is not a verified rusty-kaspad", () => {
  beforeEach(() => {
    process.env.HARDKAS_SIMULATOR = "1";
    process.env.HARDKAS_ALLOW_SIMULATOR_NODE = "1";
  });

  it("CA-EXP-01b: Docker unreachable, simulator answering 2.1.0 on 18210, both variables set → node not ok", async () => {
    identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, {
      container: undefined,
      server: SIM_ON_18210,
      probeErrors: ["docker unavailable: connection refused"]
    });
    const r = await probeSilverReadiness();
    expect(r.node.ok).toBe(false);
    expect(r.node.detail).not.toMatch(/undefined/);
    expect(r.ready["silver.p2sh.deploy-spend.v1"]).toBe(false);
    expect(r.ready["toccata.covenant.auth-1to1-transition.v1"]).toBe(false);
  });

  it("a verified simulator identity (its own expectation) is still not the canonical node", async () => {
    identity.current = evaluateNodeIdentity(SIMULATOR_NODE_EXPECTATION, {
      container: undefined,
      server: { url: "ws://127.0.0.1:19110", networkId: "simnet", serverVersion: SIMULATOR_NODE_EXPECTATION.serverVersion },
      probeErrors: []
    });
    const r = await probeSilverReadiness();
    expect(r.node.ok).toBe(false);
    expect(r.node.detail).toMatch(/kaspa-simulator, not the canonical rusty-kaspad/);
  });

  it("a mock that claims verified:true without a kind or a container is not accepted", async () => {
    identity.current = { verified: true, problems: [], observed: { server: SIM_ON_18210, probeErrors: [] } } as unknown as NodeIdentityRecord;
    const r = await probeSilverReadiness();
    expect(r.node.ok).toBe(false);
  });

  it("the canonical rusty-kaspad, verified: node ok, detail names the container and the observed digest", async () => {
    identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: CONTAINER, server: SIM_ON_18210, probeErrors: [] });
    const r = await probeSilverReadiness();
    expect(r.node.ok).toBe(true);
    expect(r.node.detail).toBe(`${CANONICAL_LOCALNET.containerName} rusty-kaspad ${CANONICAL_LOCALNET.serverVersion} (${CANONICAL_LOCALNET.imageDigest})`);
  });

  it("the covenant capability and the node matrix stay false for the simulator", async () => {
    identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server: SIM_ON_18210, probeErrors: [] });
    const caps = await new HardkasCapabilitiesApi().get();
    expect(caps.capabilities.covenants).toBe(false);
    expect(caps.runtimeMatrix?.node.toccata).toBe(false);
    expect(caps.runtimeMatrix?.node.covenants).toBe(false);
  });
});

describe("HK-15 · the covenant scopes say what the code does", () => {
  it("sdkCovenantPlanning names the v1 engine and what a node certified", async () => {
    identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server: SIM_ON_18210, probeErrors: [] });
    const caps = await new HardkasCapabilitiesApi().get();
    expect(caps.capabilities.sdkCovenantPlanning).toBe(false);
    expect(caps.scopes?.sdkCovenantPlanning).toMatch(/planDeploy\/planSpend refuse with COVENANT_PLAN_UNSUPPORTED/);
    expect(caps.scopes?.sdkCovenantPlanning).toMatch(/planGenesis\/planTransition/);
    // INT9-C1: since the topology suite on a real node, the scope says where 1:N, N:M and termination were judged (simnet
    // only) and what they are not (a corpus capability, testnet-10 evidence); it used to say "no node evidence"
    expect(caps.scopes?.sdkCovenantPlanning).toMatch(/1:N, N:M and termination judged by a real rusty-kaspad on simnet only/);
    expect(caps.scopes?.sdkCovenantPlanning).toMatch(/not a corpus capability, with no testnet-10 evidence/);
    expect(caps.scopes?.covenants).toMatch(/never a simulator/);
  });
});

describe("L-08 · the vProgs probe does not execute a vprogs from PATH", () => {
  it("finds it, reports where, marks it unverified, and never runs it", async () => {
    identity.current = evaluateNodeIdentity(CANONICAL_NODE_EXPECTATION, { container: undefined, server: SIM_ON_18210, probeErrors: [] });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-vprogs-"));
    const marker = path.join(dir, "ran.txt");
    const isWin = process.platform === "win32";
    const bin = path.join(dir, isWin ? "vprogs.cmd" : "vprogs");
    fs.writeFileSync(bin, isWin ? `@echo off\r\necho ran> "${marker}"\r\n` : `#!/bin/sh\necho ran > "${marker}"\n`, { mode: 0o755 });
    const savedPath = process.env.PATH;
    process.env.PATH = dir;
    try {
      const env = await new HardkasCapabilitiesApi().probeEnvironment({ refresh: true });
      expect(env.vprogs.installed).toBe(true);
      // Windows resolves through PATHEXT (".CMD"), and its file system ignores case
      expect(isWin ? env.vprogs.path?.toLowerCase() : env.vprogs.path).toBe(isWin ? bin.toLowerCase() : bin);
      expect(env.vprogs.verified).toBe(false);
      expect(env.vprogs.reason).toMatch(/UNVERIFIED: found on PATH, not executed/);
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
