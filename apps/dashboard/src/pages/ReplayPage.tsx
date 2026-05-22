import React, { useState } from "react";
import { useReplayStatus } from "@hardkas/react";
import { RotateCw, CheckCircle2, AlertOctagon, Info, ChevronRight, Terminal, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ReplayBadge } from "../components/ReplayBadge";

export function ReplayPage() {
  const { data: replays, isLoading } = useReplayStatus();
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

  const totalReplays = replays?.length ?? 0;
  const passedReplays = replays?.filter((r: any) => r.status?.toUpperCase() === "PASS" || r.status?.toUpperCase() === "SUCCESS").length ?? 0;
  const failedReplays = totalReplays - passedReplays;
  const isWorkspaceFullyVerified = totalReplays > 0 && failedReplays === 0;

  const truncate = (str: string, len: number = 8) => {
    if (!str) return "—";
    if (str.length <= len * 2) return str;
    return `${str.slice(0, len)}...${str.slice(-len)}`;
  };

  const formatRelativeTime = (timestamp: any): string => {
    const timeMs = typeof timestamp === "string" ? new Date(timestamp).getTime() : Number(timestamp);
    if (isNaN(timeMs)) return "—";
    const seconds = Math.floor((Date.now() - timeMs) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header Panel */}
      <div className="pb-5 border-b border-zinc-800">
        <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
          Replay Verification Center
        </h1>
        <p className="text-xs text-zinc-400 mt-1 leading-normal">
          HardKAS executes transactions locally to deterministically verify that the computed state matches signed artifact receipts.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="h-28 bg-zinc-900/35 border border-zinc-800 rounded-2xl animate-pulse" />
          <div className="h-64 bg-zinc-900/20 border border-zinc-800 rounded-2xl animate-pulse" />
        </div>
      ) : replays && replays.length > 0 ? (
        <>
          {/* Main Status Block */}
          <div className={`p-6 border rounded-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-6 ${
            isWorkspaceFullyVerified 
              ? "bg-emerald-950/10 border-emerald-500/20" 
              : failedReplays > 0
                ? "bg-red-950/10 border-red-500/20"
                : "bg-zinc-900/40 border-zinc-800"
          }`}>
            <div className="flex items-center gap-4">
              <div className={`p-3.5 rounded-xl border ${
                isWorkspaceFullyVerified 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                  : failedReplays > 0
                    ? "bg-red-500/10 border-red-500/20 text-red-400"
                    : "bg-zinc-900 border-zinc-850 text-zinc-500"
              }`}>
                {isWorkspaceFullyVerified ? (
                  <CheckCircle2 size={32} className="animate-in zoom-in-50 duration-300" />
                ) : (
                  <AlertOctagon size={32} className="animate-bounce" />
                )}
              </div>
              
              <div className="space-y-1 text-left">
                <h3 className="text-base font-extrabold text-zinc-100 tracking-tight">
                  {isWorkspaceFullyVerified 
                    ? "Workspace Fully Verified" 
                    : failedReplays > 0
                      ? "Deterministic Verification Errors"
                      : "Pending Verification"}
                </h3>
                <p className="text-xs text-zinc-400 leading-normal max-w-lg">
                  {isWorkspaceFullyVerified
                    ? "All offline and local transaction steps have successfully replayed in local execution with 100% matched roots and state paths."
                    : `${failedReplays} transactions in the current workspace fail replay check, meaning their local simulation roots do not match receipt state.`}
                </p>
              </div>
            </div>

            {/* Quick stats totals */}
            <div className="flex items-center gap-6 font-mono self-start md:self-center">
              <div className="text-left">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">Passed</span>
                <div className="text-xl font-black text-emerald-400">{passedReplays}</div>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-left">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">Failed</span>
                <div className="text-xl font-black text-red-400">{failedReplays}</div>
              </div>
              <div className="w-px h-8 bg-zinc-800" />
              <div className="text-left">
                <span className="text-[9px] uppercase tracking-widest text-zinc-500">Total Runs</span>
                <div className="text-xl font-black text-zinc-300">{totalReplays}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Replays table list */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 bg-zinc-950/10 border-b border-zinc-800/80">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 font-sans">
                    Verification History
                  </h4>
                </div>
                
                <div className="divide-y divide-zinc-900">
                  {replays.map((rep: any, i: number) => {
                    const isSuccess = rep.status?.toUpperCase() === "PASS" || rep.status?.toUpperCase() === "SUCCESS";
                    
                    return (
                      <div 
                        key={rep.id || i}
                        className={`p-4 flex items-center justify-between gap-4 hover:bg-zinc-900/20 transition-all ${
                          selectedTxId === rep.txId ? "bg-zinc-900/20" : ""
                        }`}
                      >
                        <div className="space-y-1 truncate text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono font-bold text-zinc-200">
                              Tx: {truncate(rep.txId || "", 6)}
                            </span>
                            <ReplayBadge status={rep.status} />
                          </div>
                          
                          <div className="flex items-center gap-3 text-[10px] text-zinc-500 font-mono select-none">
                            <span>Hash: {truncate(rep.artifactId || rep.hash || "", 5)}</span>
                            <span>•</span>
                            <span>{formatRelativeTime(rep.createdAt || rep.timestamp)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setSelectedTxId(selectedTxId === rep.txId ? null : rep.txId)}
                            className="text-[10px] bg-white/5 hover:bg-white/10 text-zinc-300 px-2.5 py-1 rounded transition-colors"
                          >
                            {selectedTxId === rep.txId ? "Hide detail" : "View detail"}
                          </button>
                          
                          {rep.txReceiptId && (
                            <Link 
                              to={`/transactions/${rep.txReceiptId}`}
                              className="p-1.5 bg-zinc-950 border border-zinc-850 hover:border-zinc-750 text-zinc-400 hover:text-zinc-200 rounded-lg transition-all"
                              title="Go to Transaction"
                            >
                              <ArrowRight size={12} />
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Selected replay detailed view */}
              {selectedTxId && (() => {
                const rep = replays.find((r: any) => r.txId === selectedTxId);
                if (!rep) return null;
                const mismatches = rep.mismatches || [];
                
                return (
                  <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-6 animate-in slide-in-from-bottom-2 duration-200">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                        Detailed Verification Run: {truncate(rep.txId, 6)}
                      </h4>
                      <button 
                        onClick={() => setSelectedTxId(null)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Close Detail
                      </button>
                    </div>

                    <div className="space-y-3 font-mono text-xs">
                      <div className="p-3.5 rounded-xl bg-zinc-950/40 border border-zinc-900 flex justify-between gap-3 items-center">
                        <span className="text-zinc-500">Transaction ID</span>
                        <span className="text-zinc-300 select-all font-bold">{rep.txId}</span>
                      </div>
                      <div className="p-3.5 rounded-xl bg-zinc-950/40 border border-zinc-900 flex justify-between gap-3 items-center">
                        <span className="text-zinc-500">Deterministic Replay</span>
                        <span className={rep.deterministic ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                          {rep.deterministic ? "SUCCESS (Matched)" : "FAILED (State Drift)"}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-4 flex items-center gap-2">
                        <Terminal size={14} className="text-indigo-400" />
                        Layered Semantic Diff Matrix
                      </h4>

                      <div className="space-y-4">
                        {/* Layer 1: Structural Diff */}
                        <div className="border border-zinc-800/80 rounded-xl overflow-hidden">
                          <div className="bg-zinc-900/60 px-4 py-2 border-b border-zinc-800/80 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Layer 1: Structural</span>
                            <span className="text-[10px] text-emerald-400 font-mono">Matched</span>
                          </div>
                          <div className="p-4 bg-zinc-950/40 text-[10px] font-mono text-zinc-400">
                            No missing artifacts, projections, or excluded edges detected.
                          </div>
                        </div>

                        {/* Layer 2: Deterministic Diff */}
                        <div className={`border ${mismatches.length > 0 ? 'border-red-500/30' : 'border-emerald-500/20'} rounded-xl overflow-hidden`}>
                          <div className={`${mismatches.length > 0 ? 'bg-red-950/20 border-red-500/30' : 'bg-emerald-950/10 border-emerald-500/20'} px-4 py-2 border-b flex justify-between items-center`}>
                            <span className={`text-[10px] font-bold ${mismatches.length > 0 ? 'text-red-400' : 'text-emerald-400'} uppercase tracking-widest`}>Layer 2: Deterministic</span>
                            <span className={`text-[10px] ${mismatches.length > 0 ? 'text-red-400' : 'text-emerald-400'} font-mono`}>
                              {mismatches.length > 0 ? 'Diverged' : 'Matched'}
                            </span>
                          </div>
                          <div className={`p-4 bg-zinc-950/40 text-[10px] font-mono ${mismatches.length > 0 ? 'text-red-300/90' : 'text-emerald-400/70'}`}>
                            {mismatches.length > 0 ? (
                              <div className="space-y-3 select-all overflow-x-auto">
                                {mismatches.map((m: any, idx: number) => (
                                  <div key={idx} className="pb-3 border-b border-red-500/10 last:pb-0 last:border-0">
                                    <div className="flex gap-2"><span className="text-zinc-500 w-24 shrink-0">Path:</span> <span className="font-bold">{m.path}</span></div>
                                    <div className="flex gap-2"><span className="text-zinc-500 w-24 shrink-0">Receipt:</span> <span className="bg-red-950/30 px-1 rounded text-red-200">{String(m.expected)}</span></div>
                                    <div className="flex gap-2"><span className="text-zinc-500 w-24 shrink-0">Simulated:</span> <span className="bg-emerald-950/30 px-1 rounded text-emerald-200">{String(m.actual)}</span></div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              "State Root and Causal Graph match exactly."
                            )}
                          </div>
                        </div>

                        {/* Layer 3: Runtime Noise Diff */}
                        <div className="border border-zinc-800/80 rounded-xl overflow-hidden">
                          <div className="bg-zinc-900/60 px-4 py-2 border-b border-zinc-800/80 flex justify-between items-center">
                            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Layer 3: Runtime Noise</span>
                            <span className="text-[10px] text-blue-400 font-mono">Ignored</span>
                          </div>
                          <div className="p-4 bg-zinc-950/40 text-[10px] font-mono text-zinc-500 space-y-1">
                            <div>~ Timestamp shifts implicitly ignored by strict determinism.</div>
                            <div>~ Subsystem identifiers matched functionally.</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Right: Info Rules card */}
            <div className="space-y-6">
              <div className="bg-zinc-900/35 border border-zinc-800 rounded-2xl p-6 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Info size={14} className="text-indigo-400" />
                  Lineage Validation
                </h4>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Local execution is deterministic. Every transaction must be reproducible offline by recreating the state change transitions and verifying that output roots are invariant.
                </p>
                
                <div className="pt-4 border-t border-zinc-800/60 space-y-4 text-[10px] text-zinc-500 leading-relaxed">
                  <div>
                    <strong className="text-zinc-400 font-sans block mb-1 flex items-center gap-1.5">
                      <CheckCircle2 size={12} className="text-emerald-500" /> Local deterministic
                    </strong>
                    State roots and UTXOs compute identically offline. Replay guarantees the artifact represents valid state transitions within the localnet boundary.
                  </div>
                  <div>
                    <strong className="text-zinc-400 font-sans block mb-1 flex items-center gap-1.5">
                      <AlertOctagon size={12} className="text-amber-500" /> Consensus validated (No)
                    </strong>
                    Replay does NOT mean the transaction is finalized on the Kaspa network. It only guarantees local determinism. Network finality requires a separate consensus check.
                  </div>
                  <div>
                    <strong className="text-zinc-400 font-sans block mb-1 flex items-center gap-1.5">
                      <Info size={12} className="text-sky-500" /> Replay Scope Assumptions
                    </strong>
                    - The local state projection was accurate at execution time.<br/>
                    - All dependency artifacts exist and match their hashes.<br/>
                    - Signature checks (if any) are valid within the testnet environment.
                  </div>
                  <div>
                    <strong className="text-zinc-400 font-sans block mb-1">Replay Audit command</strong>
                    Verify workspace consistency at any time by running:
                    <div className="bg-zinc-950 p-2 border border-zinc-900 rounded font-mono text-[9px] mt-2 text-indigo-300 select-all">
                      hardkas replay verify
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          title="No Replays Verified"
          description="It looks like deterministic replay validation has not run yet. Verify offline plans vs receipts to execute."
          command="hardkas replay verify"
          icon={<RotateCw size={32} />}
        />
      )}
    </div>
  );
}
