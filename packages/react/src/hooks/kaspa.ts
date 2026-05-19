import { useQuery } from "@tanstack/react-query";
import { useHardKas } from "../provider.js";
import { useHardKasSession } from "./session.js";
import { useHardKasHealth } from "./health.js";

export function useKaspaWallet() {
  const { data: session } = useHardKasSession();
  return {
    name: session?.l1.wallet,
    address: session?.l1.address,
    isLoading: !session
  };
}

export function useKaspaBalance(options: { refetchInterval?: number } = {}) {
  const { config } = useHardKas();
  const { address, name } = useKaspaWallet();
  const { data: health } = useHardKasHealth();

  const l1Status = (health as any)?.kaspa?.status || health?.l1?.status;
  const isL1Online = l1Status === "healthy" ||
    l1Status === "simulated-mode" ||
    l1Status === "ok" ||
    l1Status === "running" ||
    l1Status === "online" ||
    (!!address && address.startsWith("kaspa:sim_"));

  return useQuery({
    queryKey: ["kaspa", "balance", address, config.kaspaRpcUrl, name],
    queryFn: async () => {
      if (!address) return 0n;

      if (address.startsWith("kaspa:sim_") || l1Status === "simulated-mode") {
        return 100000000000n; // 1000 KAS
      }
      
      let url = config.kaspaRpcUrl || "http://127.0.0.1:16110";
      
      // If it is our local simnet node port, normalize to ws://127.0.0.1:18210
      if (url.includes("127.0.0.1:16110") || url.includes("localhost:16110")) {
        url = "ws://127.0.0.1:18210";
      } else if (url.includes("127.0.0.1:18210") || url.includes("localhost:18210")) {
        url = "ws://127.0.0.1:18210";
      }

      if (url.startsWith("ws://") || url.startsWith("wss://")) {
        try {
          return await new Promise<bigint>((resolve, reject) => {
            const ws = new WebSocket(url);
            const timer = setTimeout(() => {
              ws.close();
              reject(new Error("WebSocket timeout"));
            }, 3000);

            ws.onopen = () => {
              ws.send(JSON.stringify({
                id: 1,
                method: "getBalanceByAddressRequest",
                params: { address }
              }));
            };

            ws.onmessage = (event) => {
              clearTimeout(timer);
              try {
                const response = JSON.parse(event.data);
                ws.close();
                if (response.error) {
                  reject(new Error(response.error.message));
                } else {
                  const data = response.result !== undefined ? response.result : response.params;
                  resolve(BigInt(data?.balance || 0));
                }
              } catch (err) {
                ws.close();
                reject(err);
              }
            };

            ws.onerror = (err) => {
              clearTimeout(timer);
              ws.close();
              reject(err);
            };
          });
        } catch (e) {
          console.warn("Failed to fetch Kaspa balance via WebSocket, falling back to 0:", e);
          return 0n;
        }
      }

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalanceByAddressRequest",
            params: { address }
          })
        });
        const json = await response.json();
        return BigInt(json.result?.balance || 0);
      } catch (e) {
        // Gracefully catch offline local L1 node connection errors
        return 0n;
      }
    },
    enabled: !!address && isL1Online,
    refetchInterval: options.refetchInterval ?? false
  });
}
