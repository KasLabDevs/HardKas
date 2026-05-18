import { Hono } from "hono";

export const healthRoutes = new Hono();

async function checkServiceHealth(url: string): Promise<"healthy" | "offline"> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "ping", params: [], id: 1 }),
      signal: controller.signal
    }).catch(() => null);
    
    clearTimeout(timeout);
    
    if (res && res.status >= 200 && res.status < 500) {
      return "healthy";
    }
    return "offline";
  } catch {
    return "offline";
  }
}

healthRoutes.get("/", async (c) => {
  const kaspaUrl = "http://127.0.0.1:16110";
  const igraUrl = "http://127.0.0.1:8545";

  const [kaspaStatus, igraStatus] = await Promise.all([
    checkServiceHealth(kaspaUrl),
    checkServiceHealth(igraUrl)
  ]);

  let overallStatus = "healthy";
  if (kaspaStatus === "offline" && igraStatus === "offline") {
    overallStatus = "offline";
  } else if (kaspaStatus === "offline" || igraStatus === "offline") {
    overallStatus = "stale";
  }

  return c.json({
    status: overallStatus,
    services: {
      kaspa: { status: kaspaStatus, url: kaspaUrl },
      igra: { status: igraStatus, url: igraUrl }
    }
  });
});
