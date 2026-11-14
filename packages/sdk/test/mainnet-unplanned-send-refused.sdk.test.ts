import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";
import { Hardkas } from "../src/index.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// Owner rule 2026-11-11 · `tx.send(..., { allowUnplannedSignedTransaction: true })` never applies to mainnet
// (MAINNET_UNPLANNED_SEND_REFUSED), and the rule is permanent: it holds with the mainnet lockdown lifted. The lockdown's
// own guard is replaced here by a switch (`lockdown.lifted`), so the rule is observed as it would be the day mainnet
// broadcasts open. With the lockdown in place, its refusal (MAINNET_BROADCAST_DISABLED) still comes first. A loopback
// stand-in node counts every connection: a refusal is decided before any of them.
// -----------------------------------------------------------------------------

const lockdown = vi.hoisted(() => ({ lifted: false }));
vi.mock("@hardkas/core", async (importOriginal) => {
  const real = await importOriginal<typeof import("@hardkas/core")>();
  return {
    ...real,
    assertMainnetTransactionsDisabled: (...args: Parameters<typeof real.assertMainnetTransactionsDisabled>) =>
      lockdown.lifted ? undefined : real.assertMainnetTransactionsDisabled(...args)
  };
});

let server: WebSocketServer;
let url = "";
let connections = 0;
const made: string[] = [];

function workspace(): string {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-unplanned-mainnet-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = {
    execution: { default: "t", targets: { t: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } },
    networks: { "testnet-10": { kind: "kaspa-rpc", network: "testnet-10", rpcUrl: url } },
    experimental: true,
    network: { allowPublic: true }
  };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg)};\n`);
  return ws;
}

async function sendOutcome(signed: unknown, options: Record<string, unknown>) {
  const sdk: any = await Hardkas.open({ cwd: workspace() });
  const before = connections;
  try {
    await sdk.tx.send(signed, { url, ...options });
    return { code: "SENT", contacted: connections - before };
  } catch (e: any) {
    return { code: String(e?.code), message: String(e?.message), contacted: connections - before };
  } finally {
    await sdk.close();
  }
}

// a signed artifact that names no plan and says it is mainnet (never valid: the refusals under test come first)
const mainnetSigned = { schema: "hardkas.signedTx", networkId: "mainnet", execution: { mode: "rpc", network: "mainnet" }, lineage: { artifactId: "" } };
const testnetSigned = { ...mainnetSigned, networkId: "testnet-10", execution: { mode: "rpc", network: "testnet-10" } };

beforeAll(async () => {
  server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((r) => server.on("listening", () => r()));
  server.on("connection", (socket) => {
    connections++;
    socket.close();
  });
  url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  lockdown.lifted = false;
  for (const c of server.clients) c.terminate();
  await new Promise<void>((r) => server.close(() => r()));
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("an unplanned send is never allowed on mainnet", () => {
  it("with the lockdown in place, its refusal comes first: MAINNET_BROADCAST_DISABLED, nothing contacted", async () => {
    lockdown.lifted = false;
    const r = await sendOutcome(mainnetSigned, { allowUnplannedSignedTransaction: true });
    expect(r.code, r.message).toBe("MAINNET_BROADCAST_DISABLED");
    expect(r.contacted).toBe(0);
  });

  it("with the lockdown lifted: MAINNET_UNPLANNED_SEND_REFUSED, nothing contacted (the rule is permanent)", async () => {
    lockdown.lifted = true;
    try {
      for (const signed of [mainnetSigned, { ...testnetSigned, execution: { mode: "rpc", network: "kaspa-mainnet" } }]) {
        const r = await sendOutcome(signed, { allowUnplannedSignedTransaction: true });
        expect(r.code, r.message).toBe("MAINNET_UNPLANNED_SEND_REFUSED");
        expect(r.message).toMatch(/Nothing was sent or recorded/);
        expect(r.contacted).toBe(0);
      }
    } finally {
      lockdown.lifted = false;
    }
  });

  it("controls with the lockdown lifted: without the escape, or on testnet-10, this rule does not decide", async () => {
    lockdown.lifted = true;
    try {
      const noEscape = await sendOutcome(mainnetSigned, {});
      expect(noEscape.code, noEscape.message).not.toBe("MAINNET_UNPLANNED_SEND_REFUSED");
      const testnet = await sendOutcome(testnetSigned, { allowUnplannedSignedTransaction: true });
      expect(testnet.code, testnet.message).not.toBe("MAINNET_UNPLANNED_SEND_REFUSED");
      expect(testnet.code).not.toBe("SENT");
    } finally {
      lockdown.lifted = false;
    }
  });
});
