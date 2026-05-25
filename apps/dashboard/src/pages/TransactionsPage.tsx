import React, { useState } from "react";
import { useTransactions, useOverview } from "@hardkas/react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, Clock, Box, Eye, Check, Search, AlertTriangle, RotateCw } from "lucide-react";
import { ReplayBadge } from "../components/ReplayBadge";
import { EmptyState } from "../components/EmptyState";

import { formatSompi } from "@hardkas/core";

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

function safeBigInt(val: any): bigint {
  if (!val) return 0n;
  try {
    return BigInt(val);
  } catch {
    return 0n;
  }
}

export function TransactionsPage() {
  const { data: transactions, isLoading } = useTransactions();
  const { data: overview } = useOverview();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredTransactions = (transactions || []).filter((tx: any) => {
    const term = searchTerm.toLowerCase();
    return (
      (tx.txId || "").toLowerCase().includes(term) ||
      (tx.from || "").toLowerCase().includes(term) ||
      (tx.to || "").toLowerCase().includes(term) ||
      (tx.status || "").toLowerCase().includes(term)
    );
  });

  const formatRelativeTime = (timestamp: any): string => {
    const timeMs = typeof timestamp === "string" ? new Date(timestamp).getTime() : Number(timestamp);
    if (isNaN(timeMs)) return "—";
    // eslint-disable-next-line react-hooks/purity
    const seconds = Math.floor((Date.now() - timeMs) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  const truncate = (str: string, len: number = 8) => {
    if (!str) return "—";
    if (str.length <= len * 2) return str;
    return `${str.slice(0, len)}...${str.slice(-len)}`;
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            Transaction Activity Center
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            Cockpit visualizes all offline transaction plans, signed payloads, and broadcasted receipts in chronological order.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by TxID, sender, recipient..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-sans"
          />
        </div>
      </div>

      {/* Transactions Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-14 bg-zinc-900/30 border border-zinc-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTransactions.length > 0 ? (
        <div className="bg-zinc-900/20 border border-zinc-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-[10px] uppercase font-mono tracking-wider text-zinc-500 bg-zinc-950/20 select-none">
                  <th className="px-6 py-3.5 font-bold">Flow / Type</th>
                  <th className="px-6 py-3.5 font-bold">Transaction ID / Hash</th>
                  <th className="px-6 py-3.5 font-bold">Sender → Recipient</th>
                  <th className="px-6 py-3.5 font-bold">Value</th>
                  <th className="px-6 py-3.5 font-bold">Verification</th>
                  <th className="px-6 py-3.5 font-bold">Timestamp</th>
                  <th className="px-6 py-3.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900 text-xs text-zinc-300">
                {filteredTransactions.map((tx: any, i: number) => {
                  const isPlan = tx.status !== "confirmed" && tx.status !== "signed";
                  
                  return (
                    <tr 
                      key={tx.id || i}
                      className="hover:bg-zinc-900/30 transition-colors group"
                    >
                      {/* Flow / Type Badge */}
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase tracking-wider ${
                          isPlan 
                            ? "bg-sky-500/10 text-sky-400 border-sky-500/20" 
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}>
                          {isPlan ? "Plan" : "Receipt"}
                        </span>
                      </td>

                      {/* Transaction ID with DEGRADED check */}
                      <td className="px-6 py-4 font-mono font-bold text-zinc-200">
                        <div className="flex flex-col gap-1">
                          {tx.txId ? (
                            <span className="text-xs font-bold text-zinc-200 tracking-wide select-all" title={tx.txId}>
                              {truncate(tx.txId, 6)}
                            </span>
                          ) : (
                            <span className="text-zinc-500 italic text-[10px]">Unsubmitted Plan</span>
                          )}
                          {!tx.artifactId && (
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider bg-orange-500/10 text-orange-400 border-orange-500/20 max-w-max">
                              DEGRADED PROJECTION
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Sender -> Recipient */}
                      <td className="px-6 py-4 font-mono text-zinc-400">
                        <span title={tx.from}>{truncate(tx.from, 5)}</span>
                        <span className="mx-2 text-zinc-600">→</span>
                        <span title={tx.to}>{truncate(tx.to, 5)}</span>
                      </td>

                      {/* Value Amount */}
                      <td className="px-6 py-4 font-mono font-extrabold text-zinc-200">
                        <span className="text-zinc-200">{formatIgraBalance(safeBigInt(tx.amount || tx.amountSompi), tx.from)}</span>
                        <span className="text-[9px] text-zinc-500 font-bold ml-1.5 uppercase">{tx.from?.startsWith("kaspa:") ? "KAS" : "iKAS"}</span>
                      </td>

                      {/* Replay Verification status */}
                      <td className="px-6 py-4">
                        <ReplayBadge status={tx.replayStatus} />
                      </td>

                      {/* Relative Timestamp */}
                      <td className="px-6 py-4 text-zinc-500 flex items-center gap-1.5 font-mono select-none mt-1">
                        <Clock size={12} />
                        {formatRelativeTime(tx.timestamp)}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link 
                            to={`/artifacts/${tx.artifactId}`}
                            title="Inspect Truth Artifact"
                            className="inline-flex items-center justify-center w-7 h-7 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-cyan-400 rounded-lg transition-all"
                          >
                            <Box size={14} />
                          </Link>
                          <Link 
                            to={`/replay`}
                            title="Verify Replay"
                            className="inline-flex items-center justify-center w-7 h-7 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800 text-zinc-400 hover:text-emerald-400 rounded-lg transition-all"
                          >
                            <RotateCw size={14} />
                          </Link>
                          <Link 
                            to={`/transactions/${tx.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-850 text-zinc-300 font-sans font-semibold rounded-lg text-[10px] transition-all group-hover:border-zinc-600"
                          >
                            Explain
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : overview?.counts && overview.counts.artifacts > 0 ? (
        <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
            <Box size={32} className="text-amber-400" />
          </div>
          <h2 className="text-lg font-black text-amber-100 mb-2 tracking-tight">No Transaction Receipts Indexed</h2>
          <p className="text-sm text-amber-400/80 max-w-md mb-6 leading-relaxed">
            Runtime artifacts exist, but none of them are transaction receipts. The existing artifacts are likely just plans or unsigned envelopes.
          </p>
          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 w-full max-w-md flex flex-col gap-2 font-mono text-xs">
            <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-sans font-bold">Run to produce a receipt:</span>
            <span className="text-amber-300 select-all">hardkas tx send --yes</span>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Transactions Found"
          description="It looks like you haven't sent any local transactions yet. Send a transaction using the HardKAS CLI to trigger the auto-indexer."
          command="hardkas tx send --from alice --to bob --amount 10 --yes"
          icon={<ArrowLeftRight size={32} />}
        />
      )}
    </div>
  );
}
