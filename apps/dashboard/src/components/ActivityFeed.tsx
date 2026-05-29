import React, { useState } from "react";
import { useActivity, useHardKas } from "@hardkas/react";
import { Terminal, Eye, EyeOff } from "lucide-react";

export function ActivityFeed() {
  const { data: events, isLoading } = useActivity();
  const { sseStatus } = useHardKas();
  const [showHeartbeats, setShowHeartbeats] = useState(false);

  const eventIcons: Record<string, string> = {
    "session.created": "🔑",
    "session.switched": "🔄",
    "session.deleted": "🗑️",
    "health.changed": "💊",
    "health.kaspa.online": "🟢",
    "health.kaspa.offline": "🔴",
    "health.igra.online": "🟢",
    "health.igra.offline": "🔴",
    "wallet.connected": "🔗",
    "wallet.disconnected": "⛓️💥",
    "wallet.account.changed": "👤",
    "wallet.chain.changed": "🔀",
    "bridge.plan.created": "📋",
    "bridge.simulation.started": "⚡",
    "bridge.simulation.completed": "✅",
    heartbeat: "💓",
    "tx.created": "📝",
    "tx.confirmed": "💸",
    "receipt.created": "🧾",
    "deployment.tracked": "🚀",
    "replay.pass": "✅",
    "replay.fail": "❌",
    "artifact.indexed": "📦",
    "query.synced": "🔄",
    "account.updated": "👤"
  };

  const getEventDescription = (event: any): string => {
    const payload = event.payload || {};
    switch (event.type) {
      case "session.created":
        return `Session "${payload.name || ""}" created`;
      case "session.switched":
        return `Switched to session "${payload.name || ""}"`;
      case "session.deleted":
        return `Session "${payload.name || ""}" deleted`;
      case "health.changed":
        return `Health status changed to ${payload.status || "unknown"}`;
      case "health.kaspa.online":
        return `Kaspa L1 online (${payload.network || "simulated"}, DAA: ${payload.daaScore || 0})`;
      case "health.kaspa.offline":
        return `Kaspa L1 offline`;
      case "health.igra.online":
        return `Igra L2 online (Chain: ${payload.chainId || 0})`;
      case "health.igra.offline":
        return `Igra L2 offline`;
      case "wallet.connected":
        return `${payload.name || "Wallet"} connected (${payload.address ? payload.address.slice(0, 6) + "..." + payload.address.slice(-4) : ""})`;
      case "wallet.disconnected":
        return `${payload.name || "Wallet"} disconnected`;
      case "wallet.account.changed":
        return `Account changed: ${payload.address ? payload.address.slice(0, 6) + "..." + payload.address.slice(-4) : ""}`;
      case "wallet.chain.changed":
        return `Chain changed to ${payload.chainId || "unknown"}`;
      case "bridge.plan.created":
        return `Bridge transaction plan created`;
      case "bridge.simulation.started":
        return `Bridge simulation started`;
      case "bridge.simulation.completed":
        return `Bridge simulation completed successfully`;
      case "heartbeat":
        return `Heartbeat check`;
      case "tx.created":
        return `Transaction created: ${payload.txId ? payload.txId.slice(0, 8) + "..." : "new plan"}`;
      case "tx.confirmed":
        return `Transaction confirmed: ${payload.txId ? payload.txId.slice(0, 8) + "..." : "success"}`;
      case "receipt.created":
        return `Receipt generated: ${payload.id ? payload.id.slice(0, 8) : "new"}`;
      case "deployment.tracked":
        return `Deployment tracked: ${payload.contractName || "Contract"}`;
      case "replay.pass":
        return `Deterministic Replay PASS for tx ${payload.txId ? payload.txId.slice(0, 8) : ""}`;
      case "replay.fail":
        return `Deterministic Replay FAIL for tx ${payload.txId ? payload.txId.slice(0, 8) : ""}`;
      case "artifact.indexed":
        return `Artifact indexed: ${payload.schema || "data"}`;
      case "query.synced":
        return `Local files re-indexed and synchronized`;
      case "account.updated":
        return `Account balance updated: ${payload.alias || payload.address ? payload.alias || payload.address.slice(0, 10) : ""}`;
      default:
        return `${event.type}: ${typeof payload === "string" ? payload : "[Event Payload]"}`;
    }
  };

  const formatRelativeTime = (timestamp: any): string => {
    const timeMs =
      typeof timestamp === "string" ? new Date(timestamp).getTime() : Number(timestamp);
    if (isNaN(timeMs)) return "—";
    return new Date(timeMs).toISOString();
  };

  const filteredEvents = (events || []).filter(
    (event: any) => showHeartbeats || event.type !== "heartbeat"
  );

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Terminal size={20} className="text-zinc-400" />
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">
            Runtime Event Stream
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono border ${
              sseStatus === "connected"
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : sseStatus === "reconnecting"
                  ? "bg-orange-500/10 text-orange-400 border-orange-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
            }`}
          >
            sse: {sseStatus}
          </span>

          <button
            onClick={() => setShowHeartbeats(!showHeartbeats)}
            className="flex items-center gap-1.5 text-[10px] text-zinc-400 hover:text-zinc-200 bg-white/5 border border-white/5 hover:border-white/10 px-2 py-0.5 rounded transition-colors"
          >
            {showHeartbeats ? <EyeOff size={10} /> : <Eye size={10} />}
            {showHeartbeats ? "Hide heartbeats" : "Show heartbeats"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 space-y-2 max-h-[300px]">
        {isLoading ? (
          <div className="text-xs text-zinc-500 italic animate-pulse py-4">
            Loading event stream...
          </div>
        ) : filteredEvents.length > 0 ? (
          filteredEvents.map((event: any, i: number) => {
            const icon = eventIcons[event.type] || "🔹";
            return (
              <div
                key={event.id || i}
                className="flex items-center justify-between text-[11px] border-l-2 border-indigo-500/20 pl-3 py-1.5 hover:bg-white/5 transition-all duration-200 animate-in slide-in-from-top-1"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="shrink-0 text-xs">{icon}</span>
                  <span className="text-zinc-300 truncate font-mono">
                    {getEventDescription(event)}
                  </span>
                </div>
                <span className="text-[9px] text-zinc-500 shrink-0 font-mono ml-3">
                  {formatRelativeTime(event.timestamp)}
                </span>
              </div>
            );
          })
        ) : (
          <div className="text-xs text-zinc-500 italic py-4">
            No events recorded yet. Perform actions via CLI to stream logs.
          </div>
        )}
      </div>
    </div>
  );
}
