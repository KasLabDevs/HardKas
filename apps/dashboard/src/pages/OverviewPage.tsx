import React from "react";
import { 
  useOverview, 
  useHardKasSession, 
  useHardKasHealth,
  useKaspaBalance, 
  useIgraBalance
} from "@hardkas/react";
import { 
  Activity, 
  Shield, 
  Wallet, 
  Users, 
  ArrowLeftRight, 
  Package, 
  RotateCw,
  Box,
  TrendingUp,
  Cpu
} from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { Link } from "react-router-dom";

function formatSompi(amountSompi: bigint): string {
  const sign = amountSompi < 0n ? "-" : "";
  const absolute = amountSompi < 0n ? -amountSompi : amountSompi;
  const whole = absolute / 100_000_000n;
  const fractional = absolute % 100_000_000n;
  return `${sign}${whole}.${fractional.toString().padStart(8, "0")}`;
}

function formatIgraBalance(amount: bigint | undefined, address: string | undefined): string {
  if (amount === undefined) return "0.00000000";
  const isSimulated = address ? (address.startsWith("0xsim_") || address.startsWith("kaspa:sim_") || !address.startsWith("0x")) : true;
  if (isSimulated) {
    return formatSompi(amount);
  }
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  const whole = absolute / 1000000000000000000n;
  const fractional = absolute % 1000000000000000000n;
  const decimals = (fractional.toString().padStart(18, "0")).slice(0, 8);
  return `${sign}${whole}.${decimals}`;
}

export function OverviewPage() {
  const { data: overview, isLoading: overviewLoading } = useOverview();
  const { data: session } = useHardKasSession();
  const { data: health, isLoading: healthLoading, isError: healthError } = useHardKasHealth();
  const { data: kaspaBalance } = useKaspaBalance({ refetchInterval: 5000 });
  const { data: igraBalance } = useIgraBalance({ refetchInterval: 5000 });

  const statCards = [
    {
      label: "Simulated Accounts",
      value: overview?.counts?.accounts ?? "0",
      icon: <Users size={20} className="text-indigo-400" />,
      path: "/accounts"
    },
    {
      label: "Total Transactions",
      value: overview?.counts?.transactions ?? "0",
      icon: <ArrowLeftRight size={20} className="text-amber-400" />,
      path: "/transactions"
    },
    {
      label: "Workspace Artifacts",
      value: overview?.counts?.artifacts ?? "0",
      icon: <Package size={20} className="text-cyan-400" />,
      path: "/artifacts"
    },
    {
      label: "Deterministic Replays",
      value: overview?.counts?.replays ?? "0",
      icon: <RotateCw size={20} className="text-emerald-400" />,
      path: "/replay"
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Intro Hero */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-zinc-900/60 to-indigo-950/20 border border-zinc-800/80 rounded-2xl">
        <div>
          <h1 className="text-2xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            Deterministic Local Cockpit
          </h1>
          <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-xl">
            Deterministic local transaction lifecycle, replay verification, artifact lineage, and MetaMask / KasWare sandboxing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-3 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-3 shadow-md">
            <Cpu size={24} className="text-emerald-400 animate-pulse" />
            <div className="flex flex-col font-mono text-left">
              <span className="text-[9px] uppercase tracking-widest text-zinc-500">Replay Status</span>
              <span className={`text-xs font-bold ${overview?.replayVerification === "PASS" ? "text-emerald-400" : "text-amber-400"}`}>
                {overview?.replayVerification ?? "UNVERIFIED"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <Link 
            key={i} 
            to={stat.path}
            className="bg-zinc-900/40 border border-zinc-850 hover:border-zinc-700/80 hover:bg-zinc-850/10 rounded-2xl p-6 flex items-center justify-between transition-all duration-300 group shadow-md hover:shadow-indigo-500/5 hover:scale-[1.02] cursor-pointer"
          >
            <div className="space-y-2">
              <span className="text-xs font-bold text-zinc-450 group-hover:text-zinc-300 transition-colors uppercase tracking-wider">
                {stat.label}
              </span>
              <div className="text-3xl font-black font-mono text-zinc-100 tracking-tight">
                {overviewLoading ? (
                  <span className="inline-block w-12 h-8 bg-zinc-800 animate-pulse rounded-lg" />
                ) : (
                  stat.value
                )}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-900 group-hover:scale-110 group-hover:bg-zinc-900 transition-all duration-300 shadow-inner">
              {stat.icon}
            </div>
          </Link>
        ))}
      </div>

      {/* Main Section */}
      <div className="space-y-8">
        <div className="space-y-8">
          {/* Active Session & Balance Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Session Card */}
            <section className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col h-full shadow-md hover:shadow-indigo-500/5 transition-all">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2.5">
                  <Activity className="text-indigo-400" size={18} />
                  <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">Active Session</h3>
                </div>
                {session ? (
                  <span className="text-[10px] font-mono font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 px-2.5 py-0.5 rounded-full">
                    {session.name}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold bg-zinc-800 border border-zinc-700 text-zinc-400 px-2.5 py-0.5 rounded-full">
                    Idle
                  </span>
                )}
              </div>

              {session ? (
                <div className="space-y-5 flex-1 flex flex-col justify-center">
                  <div>
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">L1 Wallet Address</span>
                    <div className="font-mono text-xs text-indigo-300 bg-zinc-950/50 border border-zinc-900/80 p-3 rounded-xl mt-2 truncate hover:border-zinc-800 transition-all" title={session.l1.address}>
                      {session.l1.wallet} ({session.l1.address})
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">L2 Account Address</span>
                    <div className="font-mono text-xs text-purple-300 bg-zinc-950/50 border border-zinc-900/80 p-3 rounded-xl mt-2 truncate hover:border-zinc-800 transition-all" title={session.l2.address}>
                      {session.l2.account} ({session.l2.address})
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-zinc-550 italic text-xs leading-normal">
                  No active session found.
                  <br />
                  Run `hardkas session use [alias]` in your terminal to initialize.
                </div>
              )}
            </section>

            {/* Balances Card */}
            <section className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 flex flex-col h-full shadow-md hover:shadow-indigo-500/5 transition-all">
              <div className="flex items-center gap-2.5 mb-6">
                <Wallet className="text-purple-400" size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">Derived Balances</h3>
              </div>

              <div className="space-y-5 flex-1 flex flex-col justify-center">
                <div className="flex items-center justify-between pb-4 border-b border-zinc-850">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">Kaspa L1</span>
                    <span className="text-2xl font-black font-mono text-zinc-100 mt-2">
                      {health?.kaspa?.status === "offline" ? "—" : kaspaBalance !== undefined ? formatSompi(kaspaBalance) : "0.00000000"}
                    </span>
                  </div>
                  <span className="text-xs font-black font-mono text-indigo-400 uppercase tracking-widest bg-indigo-500/5 border border-indigo-500/10 px-2 py-0.5 rounded-md">KAS</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">Igra L2</span>
                    <span className="text-2xl font-black font-mono text-zinc-100 mt-2">
                      {health?.igra?.status === "offline" ? "—" : igraBalance !== undefined ? formatIgraBalance(igraBalance, session?.l2?.address) : "0.00000000"}
                    </span>
                  </div>
                  <span className="text-xs font-black font-mono text-purple-400 uppercase tracking-widest bg-purple-500/5 border border-purple-500/10 px-2 py-0.5 rounded-md">iKAS</span>
                </div>
              </div>
            </section>
          </div>

          {/* Network Health Card */}
          <section className="bg-zinc-900/40 border border-zinc-850 rounded-2xl p-6 shadow-md hover:shadow-indigo-500/5 transition-all">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <Shield className="text-emerald-400" size={18} />
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-200">Local RPC Services</h3>
              </div>
            </div>

            <div className="space-y-5 font-sans">
              {healthLoading ? (
                <div className="text-xs text-zinc-500 italic animate-pulse">Syncing service health...</div>
              ) : healthError ? (
                <div className="text-xs text-red-400 font-medium">Failed to load local RPC states. Server offline.</div>
              ) : (
                <>
                  {/* Kaspa L1 Node */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-zinc-950/30 border border-zinc-900 gap-3 hover:border-zinc-800 hover:bg-zinc-950/50 transition-all duration-200">
                    <div className="flex flex-col">
                      <div className="text-xs font-black text-zinc-200 tracking-wide">Kaspa L1 Node (Localnet)</div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">
                        RPC: {health?.l1?.rpcUrl || "127.0.0.1:16110"}
                      </div>
                      {health?.kaspa?.network && (
                        <div className="flex items-center gap-2 mt-1.5 wrap">
                          <span className="inline-flex items-center text-[9px] font-bold font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                            Network: {health.kaspa.network}
                          </span>
                          <span className="inline-flex items-center text-[9px] font-bold font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                            DAA Score: {health.kaspa.daaScore}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center justify-start sm:justify-end">
                      <StatusBadge status={health?.kaspa?.status || health?.l1?.status || "offline"} />
                    </div>
                  </div>

                  {/* Igra L2 Node */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-zinc-950/30 border border-zinc-900 gap-3 hover:border-zinc-800 hover:bg-zinc-950/50 transition-all duration-200">
                    <div className="flex flex-col">
                      <div className="text-xs font-black text-zinc-200 tracking-wide">Igra L2 Rollup Engine</div>
                      <div className="text-[10px] font-mono text-zinc-500 mt-1">
                        RPC: {health?.l2?.rpcUrl || "127.0.0.1:8545"}
                      </div>
                      {health?.l2 && (
                        <div className="flex items-center gap-2 mt-1.5 wrap">
                          <span className="inline-flex items-center text-[9px] font-bold font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                            Chain ID: {health.l2.chainId}
                          </span>
                          <span className="inline-flex items-center text-[9px] font-bold font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded uppercase tracking-wider">
                            Block Height: {health.l2.blockHeight}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center justify-start sm:justify-end">
                      <StatusBadge status={health?.igra?.status || health?.l2?.status || "offline"} />
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
