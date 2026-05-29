import React from "react";
import {
  Database,
  FileJson,
  ArrowRight,
  Activity,
  TerminalSquare,
  LayoutTemplate
} from "lucide-react";

export interface ProvenanceNode {
  type: "artifact" | "projection" | "replay" | "event" | "ui";
  id: string;
  label: string;
  status?: "ok" | "warn" | "error";
  timestamp?: string;
  details?: Record<string, string>;
}

export interface ProvenanceGraphProps {
  nodes: ProvenanceNode[];
}

export const ProvenanceGraph: React.FC<ProvenanceGraphProps> = ({ nodes }) => {
  const getNodeIcon = (type: string) => {
    switch (type) {
      case "artifact":
        return <FileJson size={20} className="text-amber-400" />;
      case "projection":
        return <Database size={20} className="text-emerald-400" />;
      case "replay":
        return <TerminalSquare size={20} className="text-indigo-400" />;
      case "event":
        return <Activity size={20} className="text-sky-400" />;
      case "ui":
        return <LayoutTemplate size={20} className="text-fuchsia-400" />;
      default:
        return <FileJson size={20} />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "ok":
        return "border-emerald-500/30 bg-emerald-950/10";
      case "warn":
        return "border-amber-500/30 bg-amber-950/10";
      case "error":
        return "border-red-500/30 bg-red-950/10";
      default:
        return "border-zinc-800 bg-zinc-900/30";
    }
  };

  return (
    <div className="p-6 bg-zinc-950/50 border border-zinc-800 rounded-2xl overflow-x-auto">
      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-6">
        Causal Provenance Graph
      </h4>

      <div className="flex items-center gap-2 min-w-max">
        {nodes.map((node, index) => (
          <React.Fragment key={node.id}>
            {/* Node */}
            <div
              className={`w-48 p-4 rounded-xl border flex flex-col gap-3 transition-colors ${getStatusColor(node.status)}`}
            >
              <div className="flex items-center gap-2 border-b border-zinc-800/60 pb-2">
                {getNodeIcon(node.type)}
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-300">
                  {node.type}
                </span>
              </div>

              <div className="space-y-1.5">
                <div
                  className="text-xs font-mono font-bold text-zinc-200 truncate"
                  title={node.label}
                >
                  {node.label}
                </div>
                {node.timestamp && (
                  <div className="text-[9px] font-mono text-zinc-500">
                    {new Date(node.timestamp).toISOString()}
                  </div>
                )}
              </div>

              {node.details && Object.keys(node.details).length > 0 && (
                <div className="pt-2 border-t border-zinc-800/60 space-y-1">
                  {Object.entries(node.details).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[9px] font-mono">
                      <span className="text-zinc-500">{k}:</span>
                      <span className="text-zinc-400 truncate max-w-[80px]" title={v}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Edge */}
            {index < nodes.length - 1 && (
              <div className="flex flex-col items-center justify-center text-zinc-600 px-2">
                <ArrowRight size={20} className="text-zinc-700" />
                <span className="text-[8px] font-mono uppercase tracking-widest mt-1">
                  derives
                </span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
