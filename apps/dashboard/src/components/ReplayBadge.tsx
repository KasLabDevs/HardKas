import React from "react";
import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";

export interface ReplayBadgeProps {
  status?: string;
  className?: string;
}

export function ReplayBadge({ status, className = "" }: ReplayBadgeProps) {
  if (!status) {
    return (
      <span 
        title="Unverified replay. No local deterministic execution found."
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-white/5 text-zinc-400 border border-white/5 cursor-help ${className}`}
      >
        <HelpCircle size={12} />
        UNVERIFIED
      </span>
    );
  }

  const s = status.toUpperCase();

  if (s === "PASS" || s === "SUCCESS" || s === "PASSED" || s === "VERIFIED") {
    return (
      <div 
        title="Local deterministic: ✅ | Consensus validated: ❌ (not implemented) | Network finality: ❌ (not checked)"
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 cursor-help ${className}`}
      >
        <CheckCircle2 size={12} />
        LOCAL REPLAY REPRODUCIBLE
      </div>
    );
  }

  return (
    <span 
      title="Local replay failed. The transaction execution is not deterministic."
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 cursor-help ${className}`}
    >
      <XCircle size={12} />
      REPLAY FAIL
    </span>
  );
}
