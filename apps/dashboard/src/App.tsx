import { useState, useEffect } from "react";
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

// Simple SVG QR Placeholder for Sandbox
function SandboxQR({ uri }: { uri: string }) {
  return (
    <div className="bg-white p-2 rounded-lg inline-block shadow-lg animate-in fade-in zoom-in duration-300">
      <div className="w-32 h-32 bg-black flex items-center justify-center relative overflow-hidden">
        <div className="grid grid-cols-4 gap-1 opacity-20">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="w-full h-full bg-white"></div>
          ))}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
          <QrCode size={40} className="text-white mb-1" />
          <span className="text-[6px] text-white/50 break-all leading-tight font-mono">{uri}</span>
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const [logs, setLogs] = useState<string[]>([]);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // HardKas Hooks
  const { sseStatus, subscribe } = useHardKas();
  const { data: session } = useHardKasSession();
  const { data: health, isLoading: healthLoading, isError: healthError, dataUpdatedAt: healthUpdatedAt } = useHardKasHealth();
  const { data: kaspaBalance } = useKaspaBalance({ refetchInterval: 5000 });
  const { data: igraBalance } = useIgraBalance({ refetchInterval: 5000 });

  // MetaMask Hooks
  const { state: mmState } = useMetaMaskLocal();
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
      const msg = typeof event.payload === "string" ? event.payload : JSON.stringify(event.payload);
      setLogs(prev => [`[${event.type}] ${msg || ""}`, ...prev].slice(0, 50));
    });
  }, [subscribe]);

  // eslint-disable-next-line
  const isHealthStale = Date.now() - healthUpdatedAt > 45000;

  return (
    <div className="container">
      <header className="header">
        <div className="flex items-center justify-center gap-3">
          <Box size={40} color="#6366f1" />
          <h1>HardKAS Cockpit</h1>
        </div>
        <p className="dim">Deterministic Local Runtime • v0.4.0-alpha</p>
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
                    <div className="text-sm">Kaspa L1 RPC</div>
                    <div className="text-[10px] dim">{health?.l1?.rpcUrl || "127.0.0.1:16110"}</div>
                    {health?.l1 && (
                      <div className="text-[8px] font-mono text-indigo-300/70">
                        {health.l1.networkId} • DAA: {health.l1.daaScore}
                      </div>
                    )}
                  </div>
                  <span className={`status-indicator ${health?.l1?.status === "ok" ? "status-healthy" : "status-error"}`}></span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">Igra L2 RPC</div>
                    <div className="text-[10px] dim">{health?.l2?.rpcUrl || "127.0.0.1:8545"}</div>
                    {health?.l2 && (
                      <div className="text-[8px] font-mono text-purple-300/70">
                        Chain: {health.l2.chainId} • Height: {health.l2.blockHeight}
                      </div>
                    )}
                  </div>
                  <span className={`status-indicator ${health?.l2?.status === "ok" ? "status-healthy" : "status-error"}`}></span>
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
            <div className="flex flex-col">
              <span className="dim text-[10px] uppercase">Kaspa L1 (sompi)</span>
              <span className="text-2xl font-mono">{kaspaBalance?.toString() || "0"}</span>
            </div>
            <div className="flex flex-col">
              <span className="dim text-[10px] uppercase">Igra L2 (wei)</span>
              <span className="text-2xl font-mono">{igraBalance?.toString() || "0"}</span>
            </div>
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
              <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/30">
                Missing
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="dim">L1 Sync</span>
              {kwSessionMatch ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Unlink size={12} className="text-red-400" />}
            </div>
            <div className="bg-black/20 p-2 rounded text-[10px] font-mono truncate dim border border-white/5">
              {kwState.address || "No account"}
            </div>
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
              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${mmState.connected ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-orange-500/20 text-orange-300 border-orange-500/30'}`}>
                {mmState.connected ? 'Connected' : 'Detected'}
              </span>
            ) : (
              <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full border border-red-500/30">
                Not Found
              </span>
            )}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="dim">L2 Sync</span>
              {mmSessionMatch ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Unlink size={12} className="text-red-400" />}
            </div>
            <div className="bg-black/20 p-2 rounded text-[10px] font-mono truncate dim border border-white/5">
              {mmState.account || "No account"}
            </div>
          </div>
        </section>

        {/* Runtime Stream */}
        <section className="glass-card col-span-1 md:col-span-1">
          <div className="flex items-center mb-4">
            <Terminal className="mr-2" size={20} color="#94a3b8" />
            <h3>Runtime Events</h3>
          </div>
          <div className="log-container h-[140px]">
            {logs.map((log, i) => (
              <div key={i} className="mb-1 text-[10px] opacity-80 border-l border-indigo-500/30 pl-2">
                {log}
              </div>
            ))}
            {logs.length === 0 && <div className="dim text-[10px]">Listening...</div>}
          </div>
        </section>
      </div>

      <footer className="mt-12 text-center text-xs dim pb-12">
        <LayoutDashboard size={14} className="inline mr-1 opacity-50" />
        HardKAS Cockpit • WalletConnect Sandbox v0.3.0-alpha
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <HardKasProvider 
      config={{
        kaspaRpcUrl: "http://127.0.0.1:16110",
        igraRpcUrl: "http://127.0.0.1:8545",
        localOnly: true,
        devServerUrl: typeof window !== "undefined" ? (window.location.port === "5173" ? "http://localhost:7420" : window.location.origin) : undefined
      }}
    >
      <DashboardContent />
    </HardKasProvider>
  );
}
