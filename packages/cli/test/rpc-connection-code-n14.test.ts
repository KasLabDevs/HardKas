import { describe, it, expect, vi } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { RpcConnectionError, RpcTimeoutError } from "@hardkas/kaspa-rpc";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 120_000 });

// L1-CORE-1 B2 · N-14 (integration gate G-10, 7-nov): a node that cannot be reached was reported UNKNOWN_ERROR by every
// rpc command — "Cannot connect to Kaspa RPC at … Connection timed out." carried no code, and the CLI's one parser of
// codes falls back to UNKNOWN_ERROR. The transport's errors now carry theirs: RPC_CONNECTION_FAILED (refused, lost,
// timed out while connecting) and RPC_TIMEOUT (a request that got no answer in time). Loopback only: a port nobody
// listens on.

const closedPort = () =>
  new Promise<number>((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(port));
    });
  });

describe("N-14 · an unreachable node is a typed failure, never UNKNOWN_ERROR", () => {
  it("the transport errors carry a code by default", () => {
    expect(new RpcConnectionError("x").code).toBe("RPC_CONNECTION_FAILED");
    expect(new RpcConnectionError("x", "OWN_CODE").code).toBe("OWN_CODE");
    expect(new RpcTimeoutError().code).toBe("RPC_TIMEOUT");
  });

  it("`rpc info` / `rpc utxos --url <nobody listens>` --json: a typed RPC_* code (utxos: RPC_CONNECTION_FAILED, was UNKNOWN_ERROR)", async () => {
    const port = await closedPort();
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-n14-"));
    try {
      for (const [args, expected] of [
        [["rpc", "info", "--url", `ws://127.0.0.1:${port}`, "--json"], /^RPC_[A-Z_]+$/],
        [["rpc", "utxos", "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6", "--url", `ws://127.0.0.1:${port}`, "--json"], /^RPC_CONNECTION_FAILED$/]
      ] as const) {
        const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv(), timeout: 90_000 });
        const all = `${r.stdout}\n${r.stderr}`;
        expect(r.status, all).not.toBe(0);
        expect(String(JSON.parse(r.stdout).code), all).toMatch(expected);
        expect(all, args.join(" ")).not.toMatch(/UNKNOWN_ERROR/);
      }
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
