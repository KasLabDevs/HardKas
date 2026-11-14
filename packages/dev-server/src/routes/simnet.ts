import { Hono } from "hono";
import { execFile } from "node:child_process";
import util from "node:util";
import { CPUMINER_REFERENCE_IMAGE, CANONICAL_LOCALNET, nodeRpcUrl } from "@hardkas/core";
import { JsonWrpcKaspaClient } from "@hardkas/kaspa-rpc";

const execFileAsync = util.promisify(execFile);

/** A7 (rc2 audit): the most blocks one `POST /mine` asks for. */
export const MAX_MINE_BLOCKS = 100;
/** A7: how `POST /mine` waits for the chain to advance. Exported so tests can shorten it; not part of the HTTP surface. */
export const simnetMineTiming = { pollMs: 250, perBlockMs: 500, graceMs: 5_000, maxWaitMs: 60_000 };

export const simnetRoutes = new Hono();

simnetRoutes.post("/mine", async (c) => {
  try {
    const socketAddr = c.req.raw.headers.get("x-forwarded-for") || ((c.env as any)?.incoming?.socket?.remoteAddress);

    // P34: no HARDKAS_NETWORK check here (the old "is simnet" flag was forced to true and never read). What limits this
    // route is the loopback Host check below and the canonical node's identity proof (requireNodeIdentity: the managed
    // localnet container, image digest and the network it must serve), which a non-canonical node fails.

    // We enforce local binding or strict loopback verification. Wait, Hono `c.env.incoming.socket` might not be typed or accessible depending on adapter.
    // For node, we can just reject if not explicitly authorized in dev mode.
    // Since we are in the Node adapter, the remote address is usually in c.env.incoming.socket.remoteAddress
    const host = c.req.header("host") || "";
    if (!host.startsWith("localhost:") && !host.startsWith("127.0.0.1:") && !host.startsWith("[::1]:")) {
      return c.json({ ok: false, error: "Mining endpoint is strictly restricted to local loopback" }, 403);
    }
    
    // A7 (rc2 audit): `blocks` is a bounded positive integer (it was parseInt'ed unchecked: NaN mined for 0 ms, and
    // blocks=100000000 held the request and the miner container for months), refused before anything runs
    const rawBlocks = c.req.query("blocks") ?? "10";
    const blocks = /^\d{1,6}$/.test(rawBlocks) ? Number(rawBlocks) : NaN;
    if (!Number.isSafeInteger(blocks) || blocks < 1 || blocks > MAX_MINE_BLOCKS) {
      return c.json(
        { ok: false, code: "SIMNET_MINE_BLOCKS_INVALID", error: `blocks must be an integer from 1 to ${MAX_MINE_BLOCKS} (got ${JSON.stringify(rawBlocks)}). Nothing was mined.` },
        400
      );
    }

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

    // A7: what the chain says before mining (the canonical node, proven above), so the answer reports what happened
    const rpc = new JsonWrpcKaspaClient({
      rpcUrl: nodeRpcUrl(),
      expectedNetworkId: CANONICAL_LOCALNET.network
    });
    const daaScore = async (): Promise<bigint | undefined> => {
      try {
        const v = (await rpc.getBlockDagInfo())?.virtualDaaScore;
        return v === undefined || v === null ? undefined : BigInt(v as any);
      } catch {
        return undefined;
      }
    };

    // The single canonical miner, inside the node's network namespace.
    const miner = CANONICAL_LOCALNET.minerContainerName;
    try {
      const before = await daaScore();
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

      // A7: wait until the DAA score advanced by `blocks` (simnet mines fast), bounded; it used to sleep blocks x 500 ms and
      // answer "mined" without reading the chain
      const deadline = Date.now() + Math.min(blocks * simnetMineTiming.perBlockMs + simnetMineTiming.graceMs, simnetMineTiming.maxWaitMs);
      let after = before;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, simnetMineTiming.pollMs));
        after = await daaScore();
        if (before !== undefined && after !== undefined && after - before >= BigInt(blocks)) break;
      }

      // Stop miner
      await execFileAsync("docker", ["rm", "-f", miner]).catch(() => {});

      const advancedBy = before !== undefined && after !== undefined ? after - before : undefined;
      const status =
        advancedBy === undefined ? "unobserved" : advancedBy >= BigInt(blocks) ? "mined" : advancedBy > 0n ? "partial" : "not-advanced";
      const data = {
        status,
        address,
        blocksRequested: blocks,
        ...(before !== undefined ? { daaScoreBefore: before.toString() } : {}),
        ...(after !== undefined ? { daaScoreAfter: after.toString() } : {}),
        ...(advancedBy !== undefined ? { daaScoreAdvancedBy: advancedBy.toString() } : {})
      };
      if (status === "mined" || status === "partial") return c.json({ ok: true, data });
      return c.json(
        {
          ok: false,
          code: status === "unobserved" ? "SIMNET_MINE_UNOBSERVED" : "SIMNET_MINE_NO_PROGRESS",
          error:
            status === "unobserved"
              ? "The miner ran, but the node's DAA score could not be read, so what was mined is unknown."
              : "The miner ran, but the node's DAA score did not advance.",
          data
        },
        502
      );
    } finally {
      await rpc.close();
    }
  } catch (err: any) {
    return c.json({ ok: false, error: err.message }, 500);
  }
});
