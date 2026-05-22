import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTransaction } from "@hardkas/react";
import { 
  ArrowLeft, 
  Clock, 
  Copy, 
  Check, 
  Terminal, 
  Cpu, 
  FileText, 
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { LineageGraph } from "../components/LineageGraph";
import { ReplayBadge } from "../components/ReplayBadge";
import { ProvenancePanel } from "../components/ProvenancePanel";
import { ProvenanceGraph } from "../components/ProvenanceGraph";

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

function safeBigInt(val: any): bigint {
  if (!val) return 0n;
  try {
    return BigInt(val);
  } catch {
    return 0n;
  }
}

export function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: tx, isLoading, error } = useTransaction(id ?? "");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse py-8">
        <div className="h-6 bg-zinc-800 rounded w-24" />
        <div className="h-10 bg-zinc-800 rounded w-1/2" />
        <div className="h-40 bg-zinc-850 rounded-2xl w-full" />
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="space-y-6 py-8">
        <Link to="/transactions" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200">
          <ArrowLeft size={14} /> Back to Transactions
        </Link>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center max-w-xl mx-auto my-8 space-y-3">
          <AlertTriangle size={40} className="text-red-400 mx-auto" />
          <h3 className="text-base font-extrabold text-zinc-100">Transaction Not Found</h3>
          <p className="text-xs text-zinc-400 leading-normal">
            The workspace was unable to resolve a transaction artifact with the identifier "{id}". It may have been cleaned up or re-indexed.
          </p>
        </div>
      </div>
    );
  }

  const isPlan = tx.type === "plan";
  const amountUnit = tx.from?.startsWith("kaspa:") ? "KAS" : "iKAS";

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Navigation Back */}
      <div>
        <Link 
          to="/transactions" 
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-white/5 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Activity Center
        </Link>
      </div>

      {/* Main Detail Header Card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">Transaction ID / Hash</span>
            <div className="flex items-center gap-2 group/txid">
              <h2 className="text-lg md:text-xl font-mono font-bold text-zinc-200 select-all">
                {tx.txId || "Unsubmitted Plan Payload"}
              </h2>
              {tx.txId && (
                <button
                  onClick={() => handleCopy(tx.txId, "txid")}
                  className="p-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-all opacity-0 group-hover/txid:opacity-100"
                >
                  {copiedText === "txid" ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-start md:self-center">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold font-mono border uppercase tracking-wider ${
              isPlan ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
            }`}>
              {isPlan ? "Plan Mode" : "Receipt Confirmed"}
            </span>

            <ReplayBadge status={tx.replayStatus} />
          </div>
        </div>

        {/* Amount & Time stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 pt-6 border-t border-zinc-800/60">
          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Value Amount</span>
            <div className="flex items-baseline gap-1 mt-1 font-mono">
              <span className="text-lg font-black text-zinc-100">
                {formatIgraBalance(safeBigInt(tx.amount || tx.amountSompi), tx.from)}
              </span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase">{amountUnit}</span>
            </div>
          </div>

          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Fee Paid</span>
            <div className="flex items-baseline gap-1 mt-1 font-mono">
              <span className="text-sm font-bold text-zinc-200">
                {formatIgraBalance(safeBigInt(tx.fee || tx.feeSompi), tx.from)}
              </span>
              <span className="text-[8px] font-bold text-zinc-500 uppercase">{amountUnit}</span>
            </div>
          </div>

          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Network Type</span>
            <div className="text-sm font-extrabold text-zinc-200 mt-1 uppercase">
              {tx.network || "simulated"}
            </div>
          </div>

          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">Indexed Time</span>
            <div className="flex items-center gap-1.5 text-xs text-zinc-300 mt-1 font-mono">
              <Clock size={12} className="text-zinc-500" />
              {new Date(tx.timestamp).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Lineage Graph */}
      <LineageGraph
        planId={tx.lineage?.planId || (isPlan ? tx.txId : undefined)}
        signedId={tx.lineage?.signedId}
        receiptId={tx.lineage?.receiptId || (!isPlan ? tx.txId : undefined)}
        replayId={tx.lineage?.replayId}
        replayStatus={tx.replayStatus}
      />

      {/* Flow details: Sender and Recipient addresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sender address card */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Sender Address (From)</span>
            <span className="text-[9px] font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-850 text-zinc-400">OUTGOING</span>
          </div>

          <div className="font-mono text-xs text-zinc-300 bg-zinc-950/40 border border-zinc-900/60 p-3 rounded-xl flex items-center justify-between gap-3 truncate hover:border-zinc-800">
            <span className="truncate select-all" title={tx.from}>{tx.from || "—"}</span>
            {tx.from && (
              <button
                onClick={() => handleCopy(tx.from, "from")}
                className="shrink-0 p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all"
              >
                {copiedText === "from" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
              </button>
            )}
          </div>
        </div>

        {/* Recipient address card */}
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Recipient Address (To)</span>
            <span className="text-[9px] font-mono bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-850 text-zinc-400">INCOMING</span>
          </div>

          <div className="font-mono text-xs text-zinc-300 bg-zinc-950/40 border border-zinc-900/60 p-3 rounded-xl flex items-center justify-between gap-3 truncate hover:border-zinc-800">
            <span className="truncate select-all" title={tx.to}>{tx.to || "—"}</span>
            {tx.to && (
              <button
                onClick={() => handleCopy(tx.to, "to")}
                className="shrink-0 p-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-all"
              >
                {copiedText === "to" ? <Check size={10} className="text-emerald-400" /> : <Copy size={10} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* State Provenance Viewer */}
      <ProvenanceGraph nodes={[
        {
          type: "artifact",
          id: tx.rawArtifact?.artifactId || tx.txId,
          label: (tx.rawArtifact?.artifactId || tx.txId || "").slice(0, 8) || "Artifact",
          status: tx.rawArtifact?.contentHash === "INVALID_JSON" || tx.rawArtifact?.kind === "CORRUPTED" || tx.rawArtifact?.contentHash === "MISMATCH" ? "error" : "ok",
          timestamp: tx.timestamp,
          details: { integrity: tx.rawArtifact?.contentHash ? "verified" : "unknown" }
        },
        {
          type: "projection",
          id: "query-store",
          label: "sqlite",
          status: "ok",
          details: { derivedFrom: tx.rawArtifact?.artifactId || tx.txId }
        },
        {
          type: "replay",
          id: "replay-result",
          label: "Execution Replay",
          status: tx.replayStatus === "SUCCESS" || tx.replayStatus === "PASS" ? "ok" : (tx.replayStatus ? "error" : "warn"),
          details: { scope: tx.network === "simulated" || tx.network === "simnet" || tx.mode === "simulated" ? "local-only" : "global" }
        },
        {
          type: "event",
          id: "tx-indexed",
          label: "Event Emitted",
          status: "ok",
          timestamp: tx.timestamp
        },
        {
          type: "ui",
          id: "ui-dashboard",
          label: "React UI",
          status: "ok"
        }
      ]} />

      {/* Raw JSON Inspect */}
      <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="w-full px-6 py-4 flex items-center justify-between bg-zinc-950/10 hover:bg-zinc-950/20 transition-all border-none focus:outline-none text-left cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">Raw Artifact JSON payload</span>
          </div>
          {showRaw ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
        </button>

        {showRaw && (
          <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/50">
            <pre className="font-mono text-[10px] text-indigo-200/90 leading-relaxed overflow-x-auto select-all">
              {JSON.stringify(tx, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
