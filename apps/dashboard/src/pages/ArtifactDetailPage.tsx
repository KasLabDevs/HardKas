import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useArtifact } from "@hardkas/react";
import {
  ArrowLeft,
  Clock,
  Copy,
  Check,
  Terminal,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  AlertTriangle
} from "lucide-react";
import { ProvenanceGraph } from "../components/ProvenanceGraph";
import type { ProvenanceNode } from "../components/ProvenanceGraph";

export function ArtifactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: art, isLoading, error } = useArtifact(id ?? "");
  const [copiedText, setCopiedText] = useState<string | null>(null);

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
        <div className="h-64 bg-zinc-850 rounded-2xl w-full" />
      </div>
    );
  }

  if (error || !art) {
    return (
      <div className="space-y-6 py-8">
        <Link
          to="/artifacts"
          className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft size={14} /> Back to Artifacts
        </Link>
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center max-w-xl mx-auto my-8 space-y-3">
          <AlertTriangle size={40} className="text-red-400 mx-auto" />
          <h3 className="text-base font-extrabold text-zinc-100">Artifact Not Found</h3>
          <p className="text-xs text-zinc-400 leading-normal">
            The workspace was unable to resolve an artifact with the identifier "{id}".
          </p>
        </div>
      </div>
    );
  }

  const getSchemaLabel = (schema: string): string => {
    switch (schema) {
      case "hardkas.txPlan":
        return "TX PLAN";
      case "hardkas.txReceipt":
        return "TX RECEIPT";
      case "hardkas.replay":
        return "REPLAY RESULT";
      case "hardkas.deployment":
        return "DEPLOYMENT";
      default:
        return schema.toUpperCase().replace("HARDKAS.", "");
    }
  };

  const isHashValid = (art.contentHash || art.hash) && art.contentHashMatch !== false;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Back button */}
      <div>
        <Link
          to="/artifacts"
          className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 bg-white/5 border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Artifacts
        </Link>
      </div>

      {/* Main Detail Header Card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 backdrop-blur-md space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-mono">
              Artifact ID
            </span>
            <div className="flex items-center gap-2 group/id">
              <h2 className="text-base md:text-lg font-mono font-bold text-zinc-200 select-all">
                {art.artifactId}
              </h2>
              <button
                onClick={() => handleCopy(art.artifactId, "id")}
                className="p-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-all opacity-0 group-hover/id:opacity-100"
              >
                {copiedText === "id" ? (
                  <Check size={12} className="text-emerald-400" />
                ) : (
                  <Copy size={12} />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start md:self-center">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-bold font-mono bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 uppercase tracking-wider">
              {getSchemaLabel(art.schema)}
            </span>
          </div>
        </div>

        {/* Audit Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-6 border-t border-zinc-800/60">
          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
              Integrity Check
            </span>
            <div className="flex items-center gap-1.5 text-xs mt-1 font-semibold">
              {isHashValid ? (
                <>
                  <ShieldCheck size={14} className="text-emerald-400" />
                  <span className="text-emerald-400 font-mono">VALID INTEGRITY</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={14} className="text-red-400" />
                  <span className="text-red-400 font-mono">INTEGRITY MISMATCH</span>
                </>
              )}
            </div>
          </div>

          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
              Content Hash
            </span>
            <div className="flex items-center gap-2 mt-1 group/hash">
              <span
                className="text-xs font-mono text-zinc-300 truncate max-w-[150px] select-all"
                title={art.contentHash || art.hash}
              >
                {art.contentHash || art.hash || "—"}
              </span>
              {(art.contentHash || art.hash) && (
                <button
                  onClick={() => handleCopy(art.contentHash || art.hash, "hash")}
                  className="p-1 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-all opacity-0 group-hover/hash:opacity-100"
                >
                  {copiedText === "hash" ? (
                    <Check size={10} className="text-emerald-400" />
                  ) : (
                    <Copy size={10} />
                  )}
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-zinc-500">
              Last Synced
            </span>
            <div className="flex items-center gap-1.5 text-xs text-zinc-300 mt-1 font-mono">
              <Clock size={12} className="text-zinc-500" />
              {new Date(art.createdAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Provenance Graph */}
      <ProvenanceGraph
        nodes={[
          {
            type: "artifact",
            id: art.artifactId,
            label:
              (art.artifactId || "").length > 8
                ? `${art.artifactId.slice(0, 8)}...`
                : art.artifactId || "Artifact",
            status: isHashValid ? "ok" : "error",
            timestamp: art.createdAt,
            details: {
              schema: art.schema,
              integrity: isHashValid ? "verified" : "corrupted"
            }
          },
          {
            type: "projection",
            id: "sqlite-projection",
            label: "query-store",
            status: "ok",
            details: { table: "artifacts" }
          },
          {
            type: "ui",
            id: "ui-view",
            label: "Dashboard View",
            status: "ok"
          }
        ]}
      />

      {/* Related Lineage / Parent info */}
      {(art.lineage?.parentId || art.lineage?.rootId) && (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-sans">
            Lineage Connections
          </h4>
          <div className="space-y-3 font-mono text-xs">
            {art.lineage?.parentId && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-950/20 border border-zinc-900 gap-2">
                <span className="text-zinc-500 text-[10px] uppercase tracking-widest">
                  Parent Artifact
                </span>
                <Link
                  to={`/artifacts/${art.lineage.parentId}`}
                  className="text-indigo-400 hover:text-indigo-300 truncate max-w-lg select-all"
                >
                  {art.lineage.parentId}
                </Link>
              </div>
            )}
            {art.lineage?.rootId && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-zinc-950/20 border border-zinc-900 gap-2">
                <span className="text-zinc-500 text-[10px] uppercase tracking-widest">
                  Root Artifact
                </span>
                <Link
                  to={`/artifacts/${art.lineage.rootId}`}
                  className="text-indigo-400 hover:text-indigo-300 truncate max-w-lg select-all"
                >
                  {art.lineage.rootId}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw payload explorer */}
      <div className="bg-zinc-900/20 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 bg-zinc-950/10 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={14} className="text-indigo-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Raw Artifact JSON payload
            </span>
          </div>
          <button
            onClick={() => handleCopy(JSON.stringify(art, null, 2), "payload")}
            className="text-[10px] text-zinc-400 hover:text-zinc-200 transition-colors bg-white/5 border border-white/5 hover:border-white/10 px-2.5 py-1 rounded"
          >
            {copiedText === "payload" ? "Copied Raw!" : "Copy Payload"}
          </button>
        </div>
        <div className="p-6 bg-zinc-950/50">
          <pre className="font-mono text-[10px] text-indigo-200/90 leading-relaxed overflow-x-auto select-all">
            {JSON.stringify(art, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
