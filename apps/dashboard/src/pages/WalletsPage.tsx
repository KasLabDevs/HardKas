import React from "react";
import QRCode from "react-qr-code";
import { 
  useHardKasSession, 
  useHardKasHealth,
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
import { 
  Smartphone, 
  Zap, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  QrCode, 
  AlertTriangle,
  Cpu,
  Unlink,
  ExternalLink
} from "lucide-react";

// Real SVG QR Code for Sandbox
function SandboxQR({ uri }: { uri: string }) {
  return (
    <div className="bg-white p-3 rounded-xl inline-block shadow-lg animate-in fade-in zoom-in duration-300">
      <QRCode
        value={uri}
        size={140}
        bgColor="#ffffff"
        fgColor="#0d0d12"
        level="Q"
      />
      <div className="text-center mt-2 w-[140px] truncate">
        <span className="text-[7px] text-zinc-500 break-all leading-tight font-mono">{uri}</span>
      </div>
    </div>
  );
}

export function WalletsPage() {
  const { data: session } = useHardKasSession();
  const { data: health } = useHardKasHealth();

  // MetaMask Hooks
  const { state: mmState, connect: mmConnect } = useMetaMaskLocal();
  const { switchChain: mmSwitchChain } = useSwitchToLocalIgra();
  const { matches: mmSessionMatch } = useIgraInjectedAccount(session?.l2.address);

  // KasWare Hooks
  const { state: kwState } = useKasWareLocal();
  const { connect: kwConnect } = useConnectKasWareLocal();
  const { matches: kwSessionMatch } = useKasWareSessionMatch(session?.l1.address);

  // Sandbox Hooks
  const { data: sandboxSessions } = useSandboxSessions();
  const { mutate: createSandbox } = useCreateSandboxSession();
  const { mutate: pairSandbox } = usePairSandboxSession();
  const { mutate: disconnectSandbox } = useDisconnectSandboxSession();

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Panel */}
      <div className="pb-5 border-b border-zinc-800">
        <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
          Wallet Connection Center
        </h1>
        <p className="text-xs text-zinc-400 mt-1 leading-normal">
          Manage local adapter injections for KasWare (L1) and MetaMask (L2), or run WalletConnect simulations in the sandbox.
        </p>
      </div>

      {/* Grid: L1/L2 adapters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* KasWare Local Adapter */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="text-cyan-400" size={20} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">KasWare Local (L1)</h3>
              </div>
              
              {kwState.installed ? (
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  kwState.connected 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                }`}>
                  {kwState.connected ? 'Connected' : 'Detected'}
                </span>
              ) : (
                <span className="text-[9px] font-mono font-bold bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-wider">
                  Missing
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Synchronize the injected KasWare wallet with your deterministic L1 dev session to mock key signs.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500 text-[10px] uppercase">L1 Session Sync</span>
                {kwSessionMatch ? (
                  <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> MATCHED</span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1"><Unlink size={12} /> MISMATCH</span>
                )}
              </div>

              {kwState.connected ? (
                <div className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-xl font-mono text-[10px] text-zinc-300 truncate select-all" title={kwState.address}>
                  {kwState.address}
                </div>
              ) : kwState.installed ? (
                <button 
                  onClick={() => kwConnect?.()}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-cyan-500/5"
                >
                  <Zap size={14} />
                  Connect KasWare Wallet
                </button>
              ) : (
                <div className="text-[10px] text-red-400/80 italic leading-normal p-3 rounded-xl bg-red-950/5 border border-red-500/10">
                  Extension not detected. Please install the KasWare Chrome extension to enable L1 wallet sync.
                </div>
              )}
            </div>
          </div>
        </section>

        {/* MetaMask Local Adapter */}
        <section className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ExternalLink className="text-orange-400" size={20} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">MetaMask Local (L2)</h3>
              </div>
              
              {mmState.installed ? (
                <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                  mmState.connected && mmSessionMatch
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : mmState.connected 
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                }`}>
                  {mmState.connected ? (mmSessionMatch ? 'Synced' : 'Mismatch') : 'Detected'}
                </span>
              ) : (
                <span className="text-[9px] font-mono font-bold bg-red-500/10 text-red-400 px-2 py-0.5 rounded border border-red-500/20 uppercase tracking-wider">
                  Missing
                </span>
              )}
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Connect MetaMask to the local Igra L2 rollup chain and ensure L2 session alignment.
            </p>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-500 text-[10px] uppercase">L2 Session Sync</span>
                {mmSessionMatch ? (
                  <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> MATCHED</span>
                ) : (
                  <span className="text-red-400 flex items-center gap-1"><Unlink size={12} /> MISMATCH</span>
                )}
              </div>

              {mmState.connected ? (
                <div className={`p-3 rounded-xl font-mono text-[10px] border ${
                  mmSessionMatch 
                    ? 'bg-zinc-950/40 border-zinc-900 text-emerald-400' 
                    : 'bg-orange-950/5 border-orange-500/10 text-orange-400'
                }`}>
                  <div className="truncate select-all" title={mmState.account}>Address: {mmState.account}</div>
                  <div className="text-[8px] text-zinc-500 mt-1 leading-none">
                    Chain ID: {mmState.chainId || 19416} (Igra Local)
                  </div>
                  {!mmSessionMatch && (
                    <div className="text-[8px] text-orange-400/90 italic leading-tight mt-2 border-t border-orange-500/10 pt-1.5">
                      → Switch your active MetaMask account to match expected: {session?.l2.address}
                    </div>
                  )}
                </div>
              ) : mmState.installed ? (
                <button 
                  onClick={() => mmConnect?.()}
                  className="w-full py-2 px-4 rounded-xl text-xs font-semibold bg-orange-600 hover:bg-orange-500 text-white transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-orange-500/5"
                >
                  <Zap size={14} />
                  Connect MetaMask Wallet
                </button>
              ) : (
                <div className="text-[10px] text-red-400/80 italic leading-normal p-3 rounded-xl bg-red-950/5 border border-red-500/10">
                  MetaMask not found. Please install the MetaMask Chrome extension to enable L2 wallet sync.
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* WalletConnect Sandbox Panel */}
      <section className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Smartphone className="text-indigo-400" size={24} />
            <h3 className="text-base font-bold uppercase tracking-wider text-zinc-200">WalletConnect Sandbox</h3>
          </div>
          <button 
            onClick={() => createSandbox()}
            className="btn-primary flex items-center gap-2 text-xs font-bold px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl cursor-pointer"
          >
            <Zap size={14} /> New Pairing URI
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Active pairing list */}
          <div className="lg:col-span-2 space-y-4">
            {sandboxSessions && sandboxSessions.length > 0 ? (
              sandboxSessions.map((s: any) => (
                <div 
                  key={s.id} 
                  className="bg-zinc-950/30 border border-zinc-900 hover:border-zinc-800 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all relative overflow-hidden group"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Session ID</span>
                      <span className="text-xs font-mono font-bold text-zinc-200 mt-0.5">{s.id}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase border ${
                        s.status === 'paired' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                          : 'bg-orange-500/10 text-orange-400 border-orange-500/20 animate-pulse'
                      }`}>
                        {s.status === 'paired' ? <CheckCircle2 size={10} /> : <RefreshCw size={10} className="animate-spin" />}
                        {s.status}
                      </span>

                      <button 
                        onClick={() => disconnectSandbox(s.id)}
                        className="bg-red-500/10 hover:bg-red-500/20 text-red-400 p-1.5 rounded-xl border border-red-500/20 transition-colors cursor-pointer"
                        title="Disconnect session"
                      >
                        <XCircle size={14} />
                      </button>
                    </div>
                  </div>

                  {s.status === 'pending' && (
                    <div className="flex flex-col sm:flex-row items-center gap-6 justify-center py-4 bg-zinc-950/20 border border-zinc-900 rounded-xl">
                      <SandboxQR uri={`hardkas://sandbox/connect?id=${s.id}`} />
                      <div className="space-y-3 text-center sm:text-left max-w-xs">
                        <h4 className="text-xs font-extrabold text-zinc-200">Pair via QR scan</h4>
                        <p className="text-[10px] text-zinc-500 leading-relaxed">
                          Scan this QR using a compatible mock mobile wallet, or bypass mobile completely by triggering a local pair simulator.
                        </p>
                        <button 
                          onClick={() => pairSandbox(s.id)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white border-none rounded-lg text-[10px] font-bold transition-colors cursor-pointer shadow-md shadow-emerald-500/5"
                        >
                          Simulate Local Pairing
                        </button>
                      </div>
                    </div>
                  )}

                  {s.status === 'paired' && (
                    <div className="space-y-3 bg-zinc-950/20 border border-zinc-900 p-4 rounded-xl font-mono text-[10px] animate-in slide-in-from-bottom-2">
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">L1 Address:</span>
                        <span className="text-zinc-300 select-all truncate max-w-xs">{s.l1Address || "None"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-zinc-500">L2 Address:</span>
                        <span className="text-zinc-300 select-all truncate max-w-xs">{s.l2Address || "None"}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500 italic text-xs leading-normal">
                <QrCode size={40} className="mb-3 opacity-20 text-indigo-400" />
                No active sandbox pairing sessions.
                <br />
                Create a new pairing URI to mock wallet handshakes.
              </div>
            )}
          </div>

          {/* Right Rules panel */}
          <div className="bg-zinc-950/20 border border-zinc-900 rounded-2xl p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <AlertTriangle size={14} className="text-orange-400" />
                Laboratory Rules
              </h4>
              <ul className="space-y-3.5 text-[10px] text-zinc-500 leading-relaxed font-sans">
                <li>• Ephemeral simulations: No real network traffic leaves your local machine context.</li>
                <li>• Pairing triggers session state: Pairing a sandbox utilizes session wallets to bypass authentic approvals.</li>
                <li>• Dev testing cockpit: Use this sandbox to experiment with QR-based onboarding and mock sign notifications in your apps.</li>
              </ul>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-900">
              <span className="text-[8px] uppercase font-mono text-indigo-400 tracking-widest block mb-1">Local URI Schema</span>
              <div className="bg-zinc-950/60 p-2.5 border border-zinc-900 rounded font-mono text-[9px] text-indigo-200 select-all truncate">
                hardkas://sandbox/connect?id=[session_id]
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
