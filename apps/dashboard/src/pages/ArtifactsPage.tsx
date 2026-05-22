import React, { useState } from "react";
import { useArtifacts } from "@hardkas/react";
import { Link } from "react-router-dom";
import { Package, Clock, Filter, Search, ChevronRight, Eye } from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export function ArtifactsPage() {
  const [schemaFilter, setSchemaFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { data: artifacts, isLoading } = useArtifacts(schemaFilter !== "all" ? schemaFilter : undefined);

  const filterOptions = [
    { value: "all", label: "All Schemas" },
    { value: "hardkas.txPlan", label: "Tx Plans" },
    { value: "hardkas.txReceipt", label: "Tx Receipts" },
    { value: "hardkas.replay", label: "Replays" },
    { value: "hardkas.deployment", label: "Deployments" },
  ];

  const filteredArtifacts = (artifacts || []).filter((art: any) => {
    const term = searchTerm.toLowerCase();
    return (
      (art.artifactId || "").toLowerCase().includes(term) ||
      (art.schema || "").toLowerCase().includes(term) ||
      (art.contentHash || "").toLowerCase().includes(term)
    );
  });

  const formatRelativeTime = (timestamp: any): string => {
    const timeMs = typeof timestamp === "string" ? new Date(timestamp).getTime() : Number(timestamp);
    if (isNaN(timeMs)) return "—";
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

  const getSchemaLabel = (schema: string): string => {
    if (!schema) return "UNKNOWN";
    if (schema.startsWith("hardkas.txPlan")) return "TX PLAN";
    if (schema.startsWith("hardkas.txReceipt")) return "TX RECEIPT";
    if (schema.startsWith("hardkas.replay")) return "REPLAY RESULT";
    if (schema.startsWith("hardkas.deployment")) return "DEPLOYMENT";
    return schema.toUpperCase().replace("HARDKAS.", "");
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            Workspace Artifacts
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            HardKAS generates deterministic files representing state steps. Check hashes, lineage, and schemas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Schema filter select */}
          <div className="relative w-full sm:w-44 shrink-0">
            <Filter size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <select
              value={schemaFilter}
              onChange={(e) => setSchemaFilter(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-8 pr-4 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-700 font-sans cursor-pointer appearance-none"
            >
              {filterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-full sm:w-60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by hash, schema, ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-sans"
            />
          </div>
        </div>
      </div>

      {/* Grid: Artifact cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-44 bg-zinc-900/20 border border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredArtifacts.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredArtifacts.map((art: any, i: number) => {
            const isPlan = art.schema?.startsWith("hardkas.txPlan");
            const isReceipt = art.schema?.startsWith("hardkas.txReceipt");
            const isCorrupted = art.kind === "CORRUPTED" || art.contentHash === "MISMATCH" || art.contentHash === "INVALID_JSON";
            
            return (
              <div 
                key={art.artifactId || i}
                className={`bg-zinc-900/30 border ${isCorrupted ? 'border-red-900/50 hover:border-red-700/80 bg-red-950/10' : 'border-zinc-800 hover:border-zinc-700/60'} rounded-2xl p-6 flex flex-col justify-between transition-all duration-300 group relative shadow-md hover:shadow-indigo-500/5 hover:scale-[1.02]`}
              >
                <div className="space-y-4">
                  {isCorrupted && (
                    <div className="mb-2 px-2 py-1.5 bg-red-500/10 border border-red-500/20 rounded-md text-red-400 text-[10px] font-bold uppercase tracking-wide text-center">
                      Artifact corrupted / determinism broken / excluded from replay
                    </div>
                  )}
                  {/* Schema Label & Hash */}
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                      isPlan 
                        ? "bg-sky-500/10 text-sky-400 border-sky-500/20" 
                        : isReceipt
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                    }`}>
                      {getSchemaLabel(art.schema)}
                    </span>
                    
                    {art.contentHash && (
                      <span className="text-[9px] font-mono text-zinc-500" title={art.contentHash}>
                        hash: {truncate(art.contentHash, 4)}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="text-[9px] font-mono uppercase tracking-widest text-zinc-500 leading-none">Artifact ID</div>
                    <div className="font-mono text-xs font-bold text-zinc-200 truncate" title={art.artifactId}>
                      {art.artifactId}
                    </div>
                  </div>
                </div>

                {/* Footer Time & View Action */}
                <div className="mt-6 pt-4 border-t border-zinc-800/60 flex items-center justify-between">
                  <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1">
                    <Clock size={10} />
                    {formatRelativeTime(art.createdAt)}
                  </span>

                  <Link 
                    to={`/artifacts/${art.artifactId}`}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-zinc-950/40 border border-zinc-900 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-300 font-sans font-semibold rounded-lg text-[10px] transition-colors"
                  >
                    Inspect
                    <ChevronRight size={10} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No Artifacts Found"
          description="The query store database contains no artifacts matching your selections. Try performing typical CLI flows to write local files."
          command="hardkas node status"
          icon={<Package size={32} />}
        />
      )}
    </div>
  );
}
