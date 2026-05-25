import React from "react";
import { CheckCircle2, AlertOctagon, AlertTriangle, ShieldCheck } from "lucide-react";

export interface ProvenanceProps {
  authority: string;
  derivedFrom?: string;
  originalPath?: string;
  integrity: "verified" | "corrupted" | "invalid_json" | "unknown";
  replayScope: "local-only" | "global" | "unknown";
  consensusValidated: boolean;
}

export const ProvenancePanel: React.FC<ProvenanceProps> = ({
  authority,
  derivedFrom,
  originalPath,
  integrity,
  replayScope,
  consensusValidated
}) => {
  const getIntegrityColor = () => {
    switch (integrity) {
      case "verified": return "text-emerald-400";
      case "corrupted": return "text-red-400";
      case "invalid_json": return "text-red-500";
      default: return "text-zinc-400";
    }
  };

  const getIntegrityIcon = () => {
    switch (integrity) {
      case "verified": return <CheckCircle2 size={14} className="text-emerald-400" />;
      case "corrupted": return <AlertOctagon size={14} className="text-red-400" />;
      case "invalid_json": return <AlertTriangle size={14} className="text-red-500" />;
      default: return <AlertTriangle size={14} className="text-zinc-400" />;
    }
  };

  const getBorderColor = () => {
    switch (integrity) {
      case "verified": return "border-l-emerald-500/50";
      case "corrupted": return "border-l-red-500/50";
      case "invalid_json": return "border-l-red-600/50";
      default: return "border-l-zinc-500/50";
    }
  };

  return (
    <div className={`bg-zinc-900/35 border border-zinc-800 rounded-2xl overflow-hidden`}>
      <div className={`p-6 border-l-4 ${getBorderColor()}`}>
        <div className="flex items-center gap-2 mb-4 pb-4 border-b border-zinc-800/60">
          <ShieldCheck size={16} className="text-zinc-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            State Provenance
          </h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Authority</span>
            <div className="text-xs font-mono font-bold text-zinc-200 bg-zinc-950 px-2 py-1 rounded inline-block border border-zinc-800">
              {authority}
            </div>
          </div>
          
          {derivedFrom && (
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Derived From</span>
              <div className="text-xs font-mono text-zinc-300 truncate" title={derivedFrom}>
                {derivedFrom}
              </div>
            </div>
          )}
          
          {originalPath && (
            <div className="space-y-1 lg:col-span-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Original Source Path</span>
              <div className="text-[10px] font-mono text-zinc-400 bg-zinc-950/50 px-3 py-1.5 rounded-lg border border-zinc-900/50 break-all select-all">
                {originalPath}
              </div>
            </div>
          )}
          
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Integrity</span>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              {getIntegrityIcon()}
              <span className={getIntegrityColor()}>
                {integrity}
              </span>
            </div>
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Replay Scope</span>
            <div className="text-xs font-bold text-zinc-300">
              {replayScope}
            </div>
          </div>
          
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">Consensus</span>
            <div className={`text-xs font-bold ${consensusValidated ? "text-emerald-400" : "text-zinc-500"}`}>
              {consensusValidated ? "VALIDATED" : "NOT VALIDATED"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
