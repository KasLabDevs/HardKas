import { Hono } from "hono";
import { KaspaWrpcClient } from "@hardkas/kaspa-rpc";
import { loadHardkasConfig } from "@hardkas/config";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  const { config } = await loadHardkasConfig();

  const defaultNet = config.defaultNetwork || "simnet";
  const l1Network = config.networks?.[defaultNet] as any;
  const l1Url = l1Network?.rpcUrl;

  // L2: find igra/evm network (e.g. "igra")
  const l2Network = Object.values(config.networks || {}).find(
    (n: any) => n.kind === "igra" || n.kind === "evm-rpc"
  ) as any;
  const l2Url = l2Network?.rpcUrl || "http://127.0.0.1:8545";

  let l1Status = {
    status: "not-configured" as string,
    daaScore: undefined as number | undefined,
    network: undefined as string | undefined
  };
  let l2Status = { status: "not-configured" as string };

  // L1 check via wRPC
  if (!l1Network || l1Network.kind === "simulated") {
    l1Status = { status: "simulated-mode", daaScore: 0, network: "simulated" };
  } else if (l1Url) {
    const client = new KaspaWrpcClient(l1Url);
    try {
      await client.connect(800);
      const dagInfo = (await client.getBlockDagInfo()) as any;
      client.disconnect();
      l1Status = {
        status: "healthy",
        daaScore: dagInfo?.virtualDaaScore ? Number(dagInfo.virtualDaaScore) : 0,
        network: dagInfo?.networkId || "simnet"
      };
    } catch {
      client.disconnect();
      l1Status = { status: "offline", daaScore: undefined, network: undefined };
    }
  }

  // L2 check via HTTP JSON-RPC (if configured)
  if (l2Url) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 800);
      const res = await fetch(l2Url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "eth_chainId",
          params: [],
          id: 1
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        l2Status = { status: "healthy" };
      } else {
        l2Status = { status: "offline" };
      }
    } catch {
      l2Status = { status: "offline" };
    }
  }

  const l1Healthy = l1Status.status === "healthy" || l1Status.status === "simulated-mode";
  const l2Healthy = l2Status.status === "healthy" || l2Status.status === "not-configured";

  const overall =
    l1Healthy && l2Healthy ? "healthy" : l1Healthy || l2Healthy ? "stale" : "offline";

  return c.json({
    status: overall,
    services: {
      kaspa: { status: l1Status.status, url: l1Url || "simulated" },
      igra: { status: l2Status.status, url: l2Url }
    },
    kaspa: l1Status,
    igra: l2Status
  });
});
