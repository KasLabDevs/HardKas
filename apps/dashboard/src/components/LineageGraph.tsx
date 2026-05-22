import React from "react";
import { Link } from "react-router-dom";
import { FileText, Edit3, CheckCircle2, ShieldAlert, ArrowRight, ArrowRightCircle } from "lucide-react";
import { ReplayBadge } from "./ReplayBadge";

export interface LineageGraphProps {
  planId?: string;
  signedId?: string;
  receiptId?: string;
  replayId?: string;
  replayStatus?: string;
}

export function LineageGraph({ planId, signedId, receiptId, replayId, replayStatus }: LineageGraphProps) {
  const steps = [
    {
      name: "Transaction Plan",
      description: "Deterministic dry-run",
      id: planId,
      icon: <FileText size={18} />,
      accent: "var(--accent-info, #0ea5e9)",
      exists: !!planId
    },
    {
      name: "Signed Payload",
      description: "Signed offline transaction",
      id: signedId,
      icon: <Edit3 size={18} />,
      accent: "var(--accent-warning, #f59e0b)",
      exists: !!signedId
    },
    {
      name: "Receipt / Confirmed",
      description: "Submitted to network",
      id: receiptId,
      icon: <CheckCircle2 size={18} />,
      accent: "var(--accent-success, #10b981)",
      exists: !!receiptId
    },
    {
      name: "Replay Verify",
      description: "Deterministic validation",
      id: replayId,
      icon: <ShieldAlert size={18} />,
      accent: replayStatus === "PASS" ? "var(--accent-success, #10b981)" : replayStatus === "FAIL" ? "var(--accent-danger, #ef4444)" : "var(--text-muted, #52525b)",
      exists: !!replayId,
      isReplay: true
    }
  ];

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 backdrop-blur-md">
      <h4 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-6 font-sans">
        Artifact Lineage Workflow
      </h4>
      
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-2 relative">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isNodeActive = step.exists;
          
          return (
            <React.Fragment key={index}>
              <div 
                className={`flex-1 w-full md:w-auto flex flex-col items-center p-4 rounded-xl border transition-all duration-300 ${
                  isNodeActive 
                    ? "bg-zinc-900/90 border-zinc-700/60 shadow-lg hover:border-zinc-500" 
                    : "bg-zinc-950/20 border-zinc-900/60 opacity-40 select-none"
                }`}
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center mb-3 border-2"
                  style={{
                    borderColor: isNodeActive ? step.accent : "var(--border-muted, rgba(255,255,255,0.06))",
                    color: isNodeActive ? step.accent : "var(--text-muted)",
                    boxShadow: isNodeActive ? `0 0 12px ${step.accent}20` : "none"
                  }}
                >
                  {step.icon}
                </div>
                
                <span className="text-xs font-bold text-zinc-100 mb-1">{step.name}</span>
                <span className="text-[10px] text-zinc-500 text-center mb-3 leading-tight">{step.description}</span>
                
                {step.isReplay && isNodeActive ? (
                  <Link to={step.id ? `/replay/${step.id}` : "/replay"}>
                    <ReplayBadge status={replayStatus} className="cursor-pointer hover:opacity-90" />
                  </Link>
                ) : isNodeActive && step.id ? (
                  <Link 
                    to={`/artifacts/${step.id}`}
                    className="text-[10px] bg-white/5 border border-white/5 hover:border-white/20 text-zinc-300 font-mono px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                  >
                    view artifact
                    <ArrowRightCircle size={8} />
                  </Link>
                ) : (
                  <span className="text-[9px] font-mono text-zinc-600 select-none">
                    {step.isReplay ? "PENDING" : "MISSING"}
                  </span>
                )}
              </div>
              
              {!isLast && (
                <div 
                  className={`hidden md:flex items-center text-zinc-700 ${
                    isNodeActive && steps[index + 1].exists ? "text-indigo-500 animate-pulse" : "text-zinc-800"
                  }`}
                >
                  <ArrowRight size={20} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
