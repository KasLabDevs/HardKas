import React, { useState, useEffect } from "react";
import QRCode from "react-qr-code";
import { 
  QueryClient, 
  QueryClientProvider, 
} from "@tanstack/react-query";
import { 
  Activity, 
  Shield, 
  Wallet, 
  Link as LinkIcon, 
  Terminal,
  RefreshCw,
  LayoutDashboard,
  ExternalLink,
  Copy,
  CheckCircle2,
  Box,
  Unlink,
  AlertTriangle,
  Cpu,
  Smartphone,
  QrCode,
  Zap,
  XCircle
} from "lucide-react";
import { 
  HardKasProvider,
  useHardKas,
  useHardKasHealth,
  useHardKasSession, 
  useKaspaBalance, 
  useIgraBalance,
  useMetaMaskLocal,
  useSwitchToLocalIgra,
  useIgraInjectedAccount,
  useKasWareLocal,
  useConnectKasWareLocal,
  useKasWareSessionMatch,
  useSandboxSessions,
  useCreateSandboxSession,
  usePairSandboxSession,
  useDisconnectSandboxSession
} from "@hardkas/react";

const queryClient = new QueryClient();

// Real SVG QR Code for Sandbox
function SandboxQR({ uri }: { uri: string }) {
  return (
    <div className="bg-white p-3 rounded-xl inline-block shadow-lg animate-in fade-in zoom-in duration-300">
      <QRCode
        value={uri}
        size={160}
        bgColor="#ffffff"
        fgColor="#0d0d12"
        level="Q"
      />
      <div className="text-center mt-2 w-[160px]">
        <span className="text-[7px] text-zinc-500 break-all leading-tight font-mono">{uri}</span>
      </div>
    </div>
  );
}

type ErrorBoundaryState = {
  error: Error | null;
};

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[HardKAS Dashboard] render error:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <RuntimeOfflineCard
          title="HardKAS Dashboard Error"
          description="The dashboard failed to render, but the app is still alive."
          details={this.state.error.message}
        />
      );
    }

    return this.props.children;
  }
}

function RuntimeOfflineCard({
  title = "HardKAS Runtime Offline",
  description = "Cockpit is disconnected from the local dev server.",
  details,
}: {
  title?: string;
  description?: string;
  details?: string;
}) {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-6">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-2xl">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-wide text-amber-400">
            Runtime status
          </p>
          <h1 className="mt-2 text-2xl font-semibold">
            ⚠️ {title}
          </h1>
          <p className="mt-2 text-zinc-400">
            {description}
          </p>
        </div>

        {details ? (
          <pre className="mb-4 overflow-auto rounded-xl bg-zinc-950 p-3 text-sm text-red-300">
            {details}
          </pre>
        ) : null}

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="mb-3 text-sm font-medium text-zinc-300">
            Try these commands:
          </p>

          <div className="space-y-2 font-mono text-sm">
            <div className="rounded-lg bg-zinc-900 px-3 py-2">
              hardkas node start
            </div>
            <div className="rounded-lg bg-zinc-900 px-3 py-2">
              hardkas node status
            </div>
            <div className="rounded-lg bg-zinc-900 px-3 py-2">
              hardkas node logs
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string; label: string }> = {
    healthy: { bg: "#1a3a2a", text: "#4ade80", label: "Online" },
    offline: { bg: "#3a1a1a", text: "#f87171", label: "Offline" },
    stale: { bg: "#3a3a1a", text: "#facc15", label: "Stale" },
    "simulated-mode": { bg: "#1a2a3a", text: "#60a5fa", label: "Simulated" },
    "not-configured": { bg: "#2a2a2a", text: "#6b7280", label: "Not configured" },
  };
  const c = colors[status] || colors["offline"];
  return (
    <span style={{
      display: "inline-block",
      padding: "2px 8px",
      borderRadius: "4px",
      fontSize: "11px",
      fontWeight: 600,
      background: c.bg,
      color: c.text,
    }}>
      {c.label}
    </span>
  );
}

function BalanceDisplay({ value, unit, healthStatus }: { value: number | bigint | undefined; unit: string; healthStatus: string }) {
  if (healthStatus === "offline" || healthStatus === "not-configured") {
    return (
      <div className="flex flex-col">
        <span className="dim text-[10px] uppercase">{unit}</span>
        <span className="text-2xl font-mono text-zinc-600">—</span>
        <span className="text-[9px] text-red-400/60 mt-0.5">Node offline</span>
      </div>
    );
  }
  if (healthStatus === "simulated-mode") {
    return (
      <div className="flex flex-col">
        <span className="dim text-[10px] uppercase">{unit}</span>
        <span className="text-2xl font-mono text-blue-400">
          {value !== undefined ? value.toString() : "—"}
        </span>
        <span className="text-[9px] text-blue-400/60 mt-0.5">Simulated mode</span>
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <span className="dim text-[10px] uppercase">{unit}</span>
      <span className="text-2xl font-mono text-zinc-100">
        {value !== undefined ? value.toString() : "0"}
      </span>
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

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
  "heartbeat": "💓",
};

interface LogItem {
  type: string;
  payload: any;
  timestamp: number;
}

function getEventDescription(event: LogItem): string {
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
      return `Kaspa L1 online (${payload.network || "simnet"}, DAA: ${payload.daaScore || 0})`;
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
    default:
      return `${event.type}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
  }
}

function DashboardContent() {
  console.log("[DashboardContent] Rendering...");
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [showHeartbeats, setShowHeartbeats] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [, forceUpdate] = useState(0);

  // Dynamic timestamp update timer
  useEffect(() => {
    const interval = setInterval(() => forceUpdate(n => n + 1), 5000);
    return () => clearInterval(interval);
  }, []);

  // HardKas Hooks
  const context = useHardKas();
  console.log("[DashboardContent] useHardKas returned:", context);
  const { sseStatus, subscribe } = context;
  const { data: session } = useHardKasSession();
  console.log("[DashboardContent] useHardKasSession returned:", session);
  const { data: health, isLoading: healthLoading, isError: healthError, dataUpdatedAt: healthUpdatedAt, error: healthQueryError } = useHardKasHealth();
  console.log("[DashboardContent] useHardKasHealth returned:", { health, healthLoading, healthError, healthQueryError });
  const { data: kaspaBalance } = useKaspaBalance({ refetchInterval: 5000 });
  const { data: igraBalance } = useIgraBalance({ refetchInterval: 5000 });

  // MetaMask Hooks
  const { state: mmState, connect: mmConnect } = useMetaMaskLocal();
  const { switchChain: mmSwitchChain } = useSwitchToLocalIgra();
  const { matches: mmSessionMatch } = useIgraInjectedAccount(session?.l2.address);

  // KasWare Hooks
  const { state: kwState } = useKasWareLocal();
  const { connect: kwConnect } = useConnectKasWareLocal();
  const { matches: kwSessionMatch, reason: kwMismatchReason } = useKasWareSessionMatch(session?.l1.address);

  // Sandbox Hooks
  const { data: sandboxSessions } = useSandboxSessions();
  const { mutate: createSandbox } = useCreateSandboxSession();
  const { mutate: pairSandbox } = usePairSandboxSession();
  const { mutate: disconnectSandbox } = useDisconnectSandboxSession();

  // SSE Stream via shared provider
  useEffect(() => {
    return subscribe((event) => {
      const timestamp = (event.payload as any)?.timestamp || Date.now();
      setLogs(prev => [{ type: event.type, payload: event.payload, timestamp }, ...prev].slice(0, 50));
    });
  }, [subscribe]);

  // eslint-disable-next-line
  const isHealthStale = healthUpdatedAt ? Date.now() - healthUpdatedAt > 45000 : true;

  if (healthError || healthQueryError) {
    return (
      <RuntimeOfflineCard
        title="HardKAS Runtime Offline"
        description="Cockpit is disconnected from the local dev server."
        details={healthQueryError instanceof Error ? healthQueryError.message : String(healthQueryError || "Dev server is unreachable")}
      />
    );
  }

  if (!context) {
    return (
      <RuntimeOfflineCard
        title="HardKAS Runtime Unavailable"
        description="The dashboard could not initialize the HardKAS runtime context."
      />
    );
  }

  return (
    <div className="container">
      <header className="header">
        <div className="flex items-center justify-center gap-3">
          <Box size={40} color="#6366f1" />
          <h1>HardKAS Cockpit</h1>
        </div>
        <p className="dim">Deterministic Local Runtime • v0.5.5-alpha</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded border ${
            sseStatus === "connected" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
            sseStatus === "reconnecting" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
            "bg-red-500/10 text-red-400 border-red-500/20"
          }`}>
            SSE: {sseStatus}
          </span>
        </div>
      </header>

      <div className="grid">
        {/* Session Panel */}
        <section className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Activity className="mr-2" size={20} color="#6366f1" />
              <h3>Session Identity</h3>
            </div>
            {session ? (
              <span className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                {session.name}
              </span>
            ) : (
              <span className="text-xs bg-gray-500/20 text-gray-400 px-2 py-0.5 rounded-full border border-gray-500/30">
                Idle
              </span>
            )}
          </div>
          {session ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="dim text-[10px] uppercase tracking-wider">L1 Wallet</span>
                  <div className="font-mono text-xs text-indigo-300 truncate" title={session.l1.address}>
                    {session.l1.wallet}
                  </div>
                </div>
                <div>
                  <span className="dim text-[10px] uppercase tracking-wider">L2 Account</span>
                  <div className="font-mono text-xs text-purple-300 truncate" title={session.l2.address}>
                    {session.l2.account}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="dim text-[10px] italic">No active session found. Use `hardkas session use`</p>
          )}
        </section>

        {/* Network Health Panel */}
        <section className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Shield className="mr-2" size={20} color={healthError ? "#ef4444" : "#10b981"} />
              <h3>Network Health</h3>
            </div>
            {isHealthStale && !healthLoading && (
              <span className="text-[8px] bg-orange-500/10 text-orange-400 px-1 rounded border border-orange-500/20">STALE</span>
            )}
          </div>
          <div className="space-y-4">
            {healthLoading ? (
              <div className="text-xs dim animate-pulse">Fetching health data...</div>
            ) : healthError ? (
              <div className="text-xs text-red-400 flex items-center gap-1">
                <XCircle size={12} /> Runtime API Offline
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Kaspa L1 RPC</div>
                    <div className="text-[10px] dim">{health?.l1?.rpcUrl || "127.0.0.1:16110"}</div>
                    {health?.kaspa?.network && (
                      <div className="text-[8px] font-mono text-indigo-300/70 mt-0.5">
                        Network: {health.kaspa.network} | DAA: {health.kaspa.daaScore}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={health?.kaspa?.status || health?.l1?.status || "offline"} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">Igra L2 RPC</div>
                    <div className="text-[10px] dim">{health?.l2?.rpcUrl || "127.0.0.1:8545"}</div>
                    {health?.l2 && (
                      <div className="text-[8px] font-mono text-purple-300/70 mt-0.5">
                        Chain: {health.l2.chainId} | Height: {health.l2.blockHeight}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={health?.igra?.status || health?.l2?.status || "offline"} />
                </div>
              </>
            )}
          </div>
        </section>

        {/* WalletConnect Sandbox (FINAL MISSING UX) */}
        <section className="glass-card col-span-1 md:col-span-2 row-span-2">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <Smartphone className="mr-2" size={24} color="#3b82f6" />
              <h2 className="text-xl font-bold">WalletConnect Sandbox</h2>
            </div>
            <button 
              onClick={() => createSandbox()}
              className="btn-primary flex items-center gap-2"
            >
              <Zap size={16} /> New Pairing URI
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              {sandboxSessions && sandboxSessions.length > 0 ? (
                sandboxSessions.map(s => (
                  <div key={s.id} className="bg-black/30 border border-white/5 rounded-xl p-4 transition-all hover:border-white/10">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex flex-col">
                        <span className="text-xs dim font-mono uppercase">ID: {s.id}</span>
                        <span className={`text-[10px] font-semibold mt-1 flex items-center gap-1 ${s.status === 'paired' ? 'text-emerald-400' : 'text-orange-400'}`}>
                          {s.status === 'paired' ? <CheckCircle2 size={10} /> : <RefreshCw size={10} className="animate-spin" />}
                          {s.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        {s.status === 'pending' && (
                          <button 
                            onClick={() => pairSandbox(s.id)}
                            className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] px-3 py-1 rounded-lg border border-emerald-500/30 transition-colors"
                          >
                            Pair Locally (Simulator)
                          </button>
                        )}
                        <button 
                          onClick={() => disconnectSandbox(s.id)}
                          className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-1.5 rounded-lg border border-red-500/30 transition-colors"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    </div>

                    {s.status === 'pending' && (
                      <div className="flex justify-center mb-4">
                        <SandboxQR uri={`hardkas://sandbox/connect?id=${s.id}`} />
                      </div>
                    )}

                    {s.status === 'paired' && (
                      <div className="space-y-2 mt-4 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-white/5 p-2 rounded text-[10px] font-mono">
                          <span className="dim">L1:</span> {s.l1Address || "None"}
                        </div>
                        <div className="bg-white/5 p-2 rounded text-[10px] font-mono">
                          <span className="dim">L2:</span> {s.l2Address || "None"}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-white/5 rounded-2xl dim italic text-sm">
                  <QrCode size={40} className="mb-2 opacity-20" />
                  No active sandbox sessions
                </div>
              )}
            </div>

            <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
              <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <AlertTriangle size={16} className="text-orange-400" />
                Laboratory Rules
              </h4>
              <ul className="space-y-4 text-xs dim leading-relaxed">
                <li>• This is a <strong>simulated environment</strong>. No real WalletConnect traffic leaves your machine.</li>
                <li>• Pairing simulations use your active CLI session data to mock mobile wallet approval.</li>
                <li>• Use this to test QR-based onboarding flows and multi-device UX in your app.</li>
                <li>• Sessions are <strong>ephemeral</strong> and will be cleared on server restart.</li>
              </ul>
              <div className="mt-8 pt-6 border-t border-white/5">
                <span className="text-[10px] uppercase font-mono text-indigo-400">URI Schema</span>
                <div className="bg-black/40 p-2 rounded font-mono text-[9px] mt-2 text-indigo-200">
                  hardkas://sandbox/connect?id=[session_id]
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live Balance Panel */}
        <section className="glass-card">
          <div className="flex items-center mb-4">
            <Wallet className="mr-2" size={20} color="#a855f7" />
            <h3>Live Balances</h3>
          </div>
          <div className="space-y-4">
            <BalanceDisplay 
              value={kaspaBalance} 
              unit="Kaspa L1 (sompi)" 
              healthStatus={health?.kaspa?.status || health?.l1?.status || "offline"} 
            />
            <BalanceDisplay 
              value={igraBalance} 
              unit="Igra L2 (wei)" 
              healthStatus={health?.igra?.status || health?.l2?.status || "offline"} 
            />
          </div>
        </section>

        {/* KasWare Local Adapter */}
        <section className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Cpu className="mr-2" size={20} color="#06b6d4" />
              <h3>KasWare Local</h3>
            </div>
            {kwState.installed ? (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${kwState.connected ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'}`}>
                {kwState.connected ? 'Connected' : 'Detected'}
              </span>
            ) : (
              <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
                Missing
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="dim">L1 Sync</span>
              {kwSessionMatch ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Unlink size={12} className="text-red-400" />}
            </div>
            {kwState.connected ? (
              <div className="bg-black/20 p-2 rounded text-[10px] font-mono truncate dim border border-white/5">
                {kwState.address}
              </div>
            ) : kwState.installed ? (
              <button 
                onClick={() => kwConnect?.()}
                className="w-full py-1.5 px-3 rounded text-xs font-semibold bg-cyan-500 hover:bg-cyan-600 text-white transition-all duration-200 shadow-md shadow-cyan-500/10 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Zap size={12} /> Connect KasWare
              </button>
            ) : (
              <div className="text-[10px] dim leading-normal italic text-red-400/80">
                Extension not detected. Install KasWare to enable L1 wallet sync.
              </div>
            )}
          </div>
        </section>

        {/* MetaMask Local Adapter */}
        <section className="glass-card">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <ExternalLink className="mr-2" size={20} color="#f97316" />
              <h3>MetaMask Local</h3>
            </div>
            {mmState.installed ? (
              mmState.connected ? (
                mmSessionMatch ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    ✅ Synced
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full border bg-orange-500/10 text-orange-400 border-orange-500/20">
                    ⚠️ Mismatch
                  </span>
                )
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                  Detected
                </span>
              )
            ) : (
              <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
                Missing
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="dim">L2 Sync</span>
              {mmSessionMatch ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Unlink size={12} className="text-red-400" />}
            </div>
            {mmState.connected ? (
              mmSessionMatch ? (
                <div className="space-y-1 bg-black/20 p-2 rounded text-[10px] font-mono border border-white/5">
                  <div className="truncate text-emerald-400">{mmState.account}</div>
                  <div className="dim text-[8px] mt-0.5">Chain: {mmState.chainId || 19416} (Igra Local)</div>
                </div>
              ) : (
                <div className="space-y-1.5 bg-black/20 p-2 rounded text-[10px] font-mono border border-orange-500/20">
                  <div className="truncate text-orange-400">Connected: {mmState.account}</div>
                  <div className="truncate text-indigo-300">Expected: {session?.l2.address || "None"}</div>
                  <div className="text-[8px] text-orange-400/90 italic leading-tight mt-1">
                    → Switch account in MetaMask to match session
                  </div>
                </div>
              )
            ) : mmState.installed ? (
              <div className="space-y-2">
                <button 
                  onClick={() => mmConnect?.()}
                  className="w-full py-1.5 px-3 rounded text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white transition-all duration-200 shadow-md shadow-orange-500/10 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Zap size={12} /> Connect MetaMask
                </button>
                <div className="text-[9px] dim leading-normal text-center">
                  Click to connect and sync your L2 account with the active session.
                </div>
              </div>
            ) : (
              <div className="text-[10px] dim leading-normal italic text-red-400/80">
                MetaMask not found. Install MetaMask to enable L2 wallet sync.
              </div>
            )}
          </div>
        </section>

        {/* Runtime Stream */}
        <section className="glass-card col-span-full">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <Terminal className="mr-2" size={20} color="#94a3b8" />
              <h3>Runtime Events</h3>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] bg-white/5 px-2 py-0.5 rounded border border-white/5 hover:border-white/10 transition-colors">
              <input
                type="checkbox"
                checked={showHeartbeats}
                onChange={(e) => setShowHeartbeats(e.target.checked)}
                className="w-3 h-3 rounded bg-zinc-800 border-zinc-700 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="dim font-medium">Show heartbeats</span>
            </label>
          </div>
          <div className="log-container h-[140px] overflow-y-auto space-y-1 pr-2">
            {logs
              .filter(log => showHeartbeats || log.type !== "heartbeat")
              .map((log, i) => {
                const icon = eventIcons[log.type] || "🔹";
                return (
                  <div key={i} className="flex items-center justify-between text-[10px] opacity-90 border-l border-indigo-500/30 pl-2 py-0.5 hover:bg-white/5 transition-colors">
                    <span className="truncate">
                      <span className="mr-1.5">{icon}</span>
                      {getEventDescription(log)}
                    </span>
                    <span className="dim shrink-0 ml-2 font-mono">{formatRelativeTime(log.timestamp)}</span>
                  </div>
                );
              })}
            {logs.filter(log => showHeartbeats || log.type !== "heartbeat").length === 0 && (
              <div className="dim text-[10px] italic">No events recorded yet...</div>
            )}
          </div>
        </section>
      </div>

      <footer className="mt-12 text-center text-xs dim pb-12">
        <LayoutDashboard size={14} className="inline mr-1 opacity-50" />
        HardKAS Cockpit • WalletConnect Sandbox v0.5.5-alpha
      </footer>
    </div>
  );
}

export default function App() {
  console.log("[App] Rendering...");
  return (
    <QueryClientProvider client={queryClient}>
      <HardKasProvider 
        config={{
          kaspaRpcUrl: "ws://127.0.0.1:18210",
          igraRpcUrl: "http://127.0.0.1:8545",
          localOnly: true,
          devServerUrl: typeof window !== "undefined" ? (window.location.port === "5173" ? "http://localhost:7420" : window.location.origin) : undefined
        }}
      >
        <DashboardErrorBoundary>
          <DashboardContent />
        </DashboardErrorBoundary>
      </HardKasProvider>
    </QueryClientProvider>
  );
}
