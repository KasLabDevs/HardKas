import React from "react";
import { useArtifacts } from "@hardkas/react";
import { Link } from "react-router-dom";
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  GitCommit,
  FileText,
  CheckCircle2,
  XCircle,
  ArrowRight
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export function WorkflowsPage() {
  const { data: artifacts, isLoading } = useArtifacts("hardkas.workflow.v1");

  const formatTime = (ts: string | undefined) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
      case "success":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "failed":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "running":
        return "text-sky-400 bg-sky-500/10 border-sky-500/20";
      default:
        return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            <Activity className="text-indigo-400" size={24} />
            Programmable Workflows
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            Deterministic orchestration lineages. Inspect causal steps, outputs, and agent
            sandboxing policies.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="h-64 bg-zinc-900/20 border border-zinc-800 rounded-2xl animate-pulse"
            />
          ))}
        </div>
      ) : artifacts && artifacts.length > 0 ? (
        <div className="space-y-8">
          {artifacts
            .sort(
              (a: any, b: any) =>
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
            .map((wf: any) => (
              <div
                key={wf.workflowId || wf.artifactId}
                className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm"
              >
                {/* Header */}
                <div className="px-6 py-4 bg-zinc-950 border-b border-zinc-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-zinc-100 font-mono font-bold text-sm">
                        {wf.workflowId || wf.artifactId}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(wf.status)}`}
                      >
                        {wf.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
                      <span>Created: {new Date(wf.createdAt).toLocaleString()}</span>
                      {wf.generationRange && (
                        <span className="bg-zinc-900 px-2 rounded">
                          Gen: {wf.generationRange.start}{" "}
                          <ArrowRight size={10} className="inline mx-1" />{" "}
                          {wf.generationRange.end || "active"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/artifacts/${wf.artifactId}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-sans font-medium rounded-lg text-xs transition-colors"
                    >
                      <FileText size={14} /> Raw Artifact
                    </Link>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-zinc-800/50">
                  {/* Timeline */}
                  <div className="flex-1 p-6">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                      <GitCommit size={14} /> Execution Timeline
                    </h3>

                    <div className="relative border-l border-zinc-800 ml-3 space-y-6">
                      {wf.steps?.map((step: any, idx: number) => (
                        <div key={idx} className="relative pl-6">
                          <div
                            className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${step.status === "success" ? "bg-zinc-950 border-emerald-500" : step.status === "failed" ? "bg-zinc-950 border-red-500" : "bg-zinc-950 border-zinc-600"}`}
                          />

                          <div className="flex justify-between items-start mb-1">
                            <span className="font-mono text-sm text-zinc-200 font-bold">
                              {step.type}
                            </span>
                            <span className="font-mono text-[10px] text-zinc-500">
                              {formatTime(step.completedAt || step.startedAt)}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${getStatusColor(step.status)}`}
                            >
                              {step.status}
                            </span>
                            {step.producedArtifactId && (
                              <Link
                                to={`/artifacts/${step.producedArtifactId}`}
                                className="text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
                              >
                                ↳ {step.producedArtifactId}
                              </Link>
                            )}
                          </div>

                          {step.error && (
                            <div className="mt-3 p-3 bg-red-950/20 border border-red-900/30 rounded-lg">
                              <p className="text-xs font-mono text-red-400">
                                {step.error}
                              </p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Sidebar (Policy & Integrity) */}
                  <div className="w-full lg:w-80 p-6 bg-zinc-950/30">
                    <div className="space-y-8">
                      {/* Policy Proof */}
                      {wf.policy && (
                        <div>
                          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ShieldCheck size={14} className="text-indigo-400" />{" "}
                            Sandboxing Policy
                          </h3>
                          <div className="space-y-2">
                            <PolicyRow
                              label="Network Access"
                              allowed={wf.policy.allowNetwork}
                            />
                            <PolicyRow
                              label="Mainnet Access"
                              allowed={wf.policy.allowMainnet}
                            />
                            <PolicyRow
                              label="External Wallets"
                              allowed={wf.policy.allowExternalWallet}
                            />
                            <PolicyRow
                              label="Mutations"
                              allowed={!wf.policy.requireDryRun}
                            />
                          </div>
                        </div>
                      )}

                      {/* Produced Artifacts */}
                      {wf.producedArtifacts && wf.producedArtifacts.length > 0 && (
                        <div>
                          <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Package size={14} className="text-indigo-400" /> Produced
                            Artifacts
                          </h3>
                          <div className="flex flex-col gap-2">
                            {wf.producedArtifacts.map((pid: string) => (
                              <Link
                                key={pid}
                                to={`/artifacts/${pid}`}
                                className="font-mono text-[10px] text-zinc-300 hover:text-white bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 truncate"
                              >
                                {pid}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Error Envelope */}
                      {wf.errorEnvelope && (
                        <div>
                          <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <ShieldAlert size={14} /> Fatal Workflow Error
                          </h3>
                          <div className="bg-red-950/20 border border-red-900/50 p-3 rounded-lg">
                            <p className="text-[10px] font-mono font-bold text-red-300 mb-1">
                              {wf.errorEnvelope.code}
                            </p>
                            <p className="text-xs text-red-400/80 leading-snug">
                              {wf.errorEnvelope.message}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      ) : (
        <EmptyState
          title="No Workflows Found"
          description="It looks like you haven't orchestrated any programmable workflows yet. Workflows are executed by HardKAS agents or through the SDK."
          command="hardkas workflow run script.json"
          icon={<Activity size={32} />}
        />
      )}
    </div>
  );
}

function PolicyRow({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className="flex justify-between items-center bg-zinc-900/50 px-3 py-2 rounded-lg border border-zinc-800">
      <span className="text-xs font-mono text-zinc-300">{label}</span>
      {allowed ? (
        <CheckCircle2 size={14} className="text-emerald-500" />
      ) : (
        <XCircle size={14} className="text-red-500" />
      )}
    </div>
  );
}
