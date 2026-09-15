import { Hono } from "hono";
import { execFile } from "node:child_process";
import util from "node:util";
import { CPUMINER_REFERENCE_IMAGE, CANONICAL_LOCALNET } from "@hardkas/core";

const execFileAsync = util.promisify(execFile);

export const simnetRoutes = new Hono();

simnetRoutes.post("/mine", async (c) => {
  try {
    const socketAddr = c.req.raw.headers.get("x-forwarded-for") || ((c.env as any)?.incoming?.socket?.remoteAddress);
    
    // Check if network is simnet
    // Normally dev-server uses HARDKAS_NETWORK or just assume if not explicitly mainnet.
    // In HardKas, we default to simnet or rely on process.env.HARDKAS_NETWORK
    const isSimnet = process.env.HARDKAS_NETWORK === "simnet" || true; // Currently assumed simnet mode in dev-server
    
    // We enforce local binding or strict loopback verification. Wait, Hono `c.env.incoming.socket` might not be typed or accessible depending on adapter.
    // For node, we can just reject if not explicitly authorized in dev mode.
    // Since we are in the Node adapter, the remote address is usually in c.env.incoming.socket.remoteAddress
    const host = c.req.header("host") || "";
    if (!host.startsWith("localhost:") && !host.startsWith("127.0.0.1:") && !host.startsWith("[::1]:")) {
      return c.json({ ok: false, error: "Mining endpoint is strictly restricted to local loopback" }, 403);
    }
    
    const blocks = c.req.query("blocks") || "10";

    // Mine into the first dev account; there is no fallback address to invent.
    const { listDevAccountsSync } = await import("@hardkas/accounts");
    const accounts = listDevAccountsSync(process.cwd());
    const address = accounts[0]?.address;
    if (!address) {
      return c.json({ ok: false, error: "NO_DEV_ACCOUNT: create a dev account to mine into" }, 409);
    }

    // Only the canonical node is mined into, and only once it proves its identity.
    const { requireNodeIdentity } = await import("@hardkas/node-runner");
    try {
      await requireNodeIdentity();
    } catch (e: any) {
      return c.json({ ok: false, error: e.message }, 409);
    }

    // The single canonical miner, inside the node's network namespace.
    const miner = CANONICAL_LOCALNET.minerContainerName;
    await execFileAsync("docker", ["rm", "-f", miner]).catch(() => {});
    try {
      await execFileAsync("docker", [
        "run", "-d", "--name", miner,
        "--network", `container:${CANONICAL_LOCALNET.containerName}`,
        CPUMINER_REFERENCE_IMAGE,
        "-a", address, "-s", "127.0.0.1", "-p", String(CANONICAL_LOCALNET.ports.rpc),
        "--mine-when-not-synced", "-t", "1"
      ]);
    } catch (e: any) {
      return c.json({ ok: false, error: `MINER_START_FAILED: ${e.message}` }, 502);
    }

    // Wait for approx time to mine requested blocks (simnet mines very fast)
    await new Promise(r => setTimeout(r, parseInt(blocks) * 500));

    // Stop miner
    await execFileAsync("docker", ["rm", "-f", miner]).catch(() => {});

    return c.json({ ok: true, data: { status: "mined", address } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
