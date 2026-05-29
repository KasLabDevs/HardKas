import React, { useState } from "react";
import { useArtifacts, useTransactions } from "@hardkas/react";
import { Link } from "react-router-dom";
import {
  Package,
  Clock,
  Filter,
  Search,
  ChevronRight,
  Eye,
  AlertTriangle
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export function ArtifactsPage() {
  const [schemaFilter, setSchemaFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const { data: artifacts, isLoading } = useArtifacts(
    schemaFilter !== "all" ? schemaFilter : undefined
  );
  const { data: transactions } = useTransactions();

  const filterOptions = [
    { value: "all", label: "All Schemas" },
    { value: "hardkas.txPlan", label: "Tx Plans" },
    { value: "hardkas.txReceipt", label: "Tx Receipts" },
    { value: "hardkas.replay", label: "Replays" },
    { value: "hardkas.deployment", label: "Deployments" }
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
    const timeMs =
      typeof timestamp === "string" ? new Date(timestamp).getTime() : Number(timestamp);
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

  const getSchemaLabel = (schema: string): string => {
    if (!schema) return "UNKNOWN";
    if (schema.startsWith("hardkas.txPlan")) return "TX PLAN";
    if (schema.startsWith("hardkas.txReceipt")) return "TX RECEIPT";
    if (schema.startsWith("hardkas.replay")) return "REPLAY RESULT";
    if (schema.startsWith("hardkas.deployment")) return "DEPLOYMENT";
    return schema.toUpperCase().replace("HARDKAS.", "");
  };

  const groupedArtifacts = React.useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredArtifacts.forEach((art: any) => {
      const flow = art.flowId || art.txId || art.artifactId;
      if (!groups.has(flow)) groups.set(flow, []);
      groups.get(flow)!.push(art);
    });
    return Array.from(groups.entries()).map(([flowId, artifacts]) => {
      // sort artifacts so oldest is first (Plan -> Signed -> Receipt)
      artifacts.sort(
        (a: any, b: any) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );

      const hasReceipt = artifacts.some((a: any) =>
        a.schema?.startsWith("hardkas.txReceipt")
      );
      const hasReplay = artifacts.some((a: any) =>
        a.schema?.startsWith("hardkas.replayReport")
      );
      const isCorrupted = artifacts.some(
        (a: any) => a.kind === "CORRUPTED" || a.contentHash === "MISMATCH"
      );

      let flowStatus = "INCOMPLETE";
      let flowMessage = "Plan → SignedTx → Missing Receipt → Replay Pending";

      if (isCorrupted) {
        flowStatus = "CORRUPTED";
        flowMessage = "Lineage corrupted";
      } else if (hasReplay) {
        flowStatus = "VERIFIED";
        flowMessage = "Plan → SignedTx → Receipt → Replay Verified";
      } else if (hasReceipt) {
        flowStatus = "COMPLETE";
        flowMessage = "Plan → SignedTx → Receipt → Replay Pending";
      }

      return { flowId, artifacts, flowStatus, flowMessage };
    });
  }, [filteredArtifacts]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            Workspace Artifacts
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            HardKAS generates deterministic files representing state steps. Check hashes,
            causal lineage, and schemas.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Schema filter select */}
          <div className="relative w-full sm:w-44 shrink-0">
            <Filter
              size={12}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
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
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"
            />
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

      {/* Grouped Causal Lineages */}
      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-32 bg-zinc-900/20 border border-zinc-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : groupedArtifacts.length > 0 ? (
        <div className="space-y-6">
          {groupedArtifacts.map((group) => (
            <div
              key={group.flowId}
              className="bg-zinc-900/20 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm"
            >
              <div className="px-6 py-4 bg-zinc-950/20 border-b border-zinc-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Package size={14} className="text-zinc-500" />
                    <span className="text-xs font-bold text-zinc-300 font-sans uppercase tracking-wider">
                      Causal Lineage
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                      {group.flowId}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                        group.flowStatus === "VERIFIED"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          : group.flowStatus === "CORRUPTED"
                            ? "bg-red-500/10 text-red-400 border-red-500/20"
                            : group.flowStatus === "COMPLETE"
                              ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }`}
                    >
                      {group.flowStatus}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-2 ml-6">
                    <span>Flow:</span>
                    <span className="text-zinc-400">{group.flowMessage}</span>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 uppercase">
                  {group.artifacts.length}{" "}
                  {group.artifacts.length === 1 ? "Artifact" : "Artifacts"}
                </div>
              </div>

              <div className="p-6">
                <div className="relative border-l-2 border-zinc-800/80 ml-2 pl-6 space-y-6">
                  {group.artifacts.map((art: any, i: number) => {
                    const isPlan = art.schema?.startsWith("hardkas.txPlan");
                    const isReceipt = art.schema?.startsWith("hardkas.txReceipt");
                    const isCorrupted =
                      art.kind === "CORRUPTED" ||
                      art.contentHash === "MISMATCH" ||
                      art.contentHash === "INVALID_JSON";

                    return (
                      <div key={art.artifactId || i} className="relative group">
                        <div className="absolute -left-[31px] top-4 w-3 h-3 bg-zinc-900 border-2 border-indigo-500/60 rounded-full group-hover:border-indigo-400 group-hover:shadow-[0_0_8px_rgba(99,102,241,0.4)] transition-all" />

                        <div
                          className={`bg-zinc-900/40 border ${isCorrupted ? "border-red-900/50 bg-red-950/10" : "border-zinc-800/60 hover:border-zinc-700/60"} rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all shadow-sm`}
                        >
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${
                                  isPlan
                                    ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                                    : isReceipt
                                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                      : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                }`}
                              >
                                {getSchemaLabel(art.schema)}
                              </span>
                              <span className="text-[10px] font-mono text-zinc-500">
                                <span className="text-zinc-600">ID:</span>{" "}
                                {art.artifactId}
                              </span>
                              {isCorrupted && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  <AlertTriangle size={10} /> Corrupted
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-[10px] font-mono text-zinc-500">
                              {art.contentHash && (
                                <span title={art.contentHash}>
                                  hash: {truncate(art.contentHash, 6)}
                                </span>
                              )}
                              {art.parentArtifactId && (
                                <span>parent: {truncate(art.parentArtifactId, 6)}</span>
                              )}
                              <span className="flex items-center gap-1">
                                <Clock size={10} /> {formatRelativeTime(art.createdAt)}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            <Link
                              to={`/artifacts/${art.artifactId}`}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900 text-zinc-300 font-sans font-semibold rounded-lg text-[10px] transition-colors"
                            >
                              <Eye size={12} /> View Truth File
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : transactions && transactions.length > 0 ? (
        <div className="bg-red-950/20 border border-red-900/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <AlertTriangle size={32} className="text-red-500 mb-4" />
          <h2 className="text-lg font-bold text-red-100 mb-2">
            Transactions exist without authoritative artifacts.
          </h2>
          <p className="text-sm text-red-300/80 mb-6 max-w-md">
            This workspace has projection drift. The SQLite cache contains transactions,
            but the definitive artifacts are missing from the filesystem.
          </p>
          <div className="bg-black/40 border border-red-900/30 rounded-xl p-4 w-full max-w-lg text-left">
            <div className="text-xs font-mono text-zinc-500 mb-2">Run:</div>
            <code className="text-sm font-mono text-red-200 block mb-4">
              hardkas doctor --consistency --strict
            </code>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No Artifacts Found"
          description="It looks like you haven't generated any transaction artifacts yet. Run a HardKAS transaction to create deterministic files."
          command="hardkas tx send --from alice --to bob --amount 10"
          icon={<Package size={32} />}
        />
      )}
    </div>
  );
}
