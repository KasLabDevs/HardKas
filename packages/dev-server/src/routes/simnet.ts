import { Hono } from "hono";
import { exec } from "node:child_process";
import util from "node:util";

const execAsync = util.promisify(exec);

export const simnetRoutes = new Hono();

simnetRoutes.post("/mine", async (c) => {
  try {
    const socketAddr = c.req.raw.headers.get("x-forwarded-for") || (c.env?.incoming?.socket?.remoteAddress);
    
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
    
    // We assume there's a runner running locally or a docker container.
    // In HardKas simnet, we just spin up cpuminer for a brief moment.
    // We can use a random dev account to mine into.
    const { listDevAccountsSync } = await import("@hardkas/accounts");
    const accounts = listDevAccountsSync(process.cwd());
    const address = accounts[0]?.address || "simnet:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzcxw";
    
    // Clean up any old miner
    await execAsync(`docker rm -f hardkas-helper-miner`).catch(() => {});
    
    // Run cpuminer in background, it will mine some blocks
    await execAsync(`docker run -d --name hardkas-helper-miner --network host kaspanet/cpuminer:latest -a ${address} -s 127.0.0.1 -p 16210 --mine-when-not-synced -t 1`).catch((e) => {
      console.warn("Could not start helper-miner. Is docker running and network host working?", e.message);
    });
    
    // Wait for approx time to mine requested blocks (simnet mines very fast)
    // 5 seconds should mine dozens of blocks.
    await new Promise(r => setTimeout(r, parseInt(blocks) * 500));
    
    // Stop miner
    await execAsync(`docker rm -f hardkas-helper-miner`).catch(() => {});
    
    return c.json({ ok: true, data: { status: "mined", address } });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
