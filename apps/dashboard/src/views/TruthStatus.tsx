import { useEffect, useState } from "react";
import { FileCheck, AlertTriangle } from "lucide-react";
import { ActivityTimelineCompact } from "../components/ActivityTimelineCompact";
import { EmptyState } from "../components/EmptyState";
import { LoadingState } from "../components/LoadingState";

interface ArtifactStatus {
  artifactId: string;
  canonicalStatus: string;
  semanticHash?: string;
  source: string;
  sourceNote?: string;
}

interface StatusResponse {
  loaded: boolean;
  source: string;
  sourceNote?: string;
  loadedAt: string;
  artifacts: ArtifactStatus[];
  message?: string;
}

const statusColors: Record<string, string> = {
  VERIFIED: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  REPLAY_VERIFIED: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
  PROJECTED: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  STALE: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
  CORRUPTED: "bg-red-500/10 text-red-400 border border-red-500/20",
  QUARANTINED: "bg-red-500/10 text-red-400 border border-red-500/20",
  UNKNOWN: "bg-zinc-800 text-zinc-500 border border-zinc-700"
};

export function TruthStatus() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [accountsData, setAccountsData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const token = (window as any).__HARDKAS_DEV_TOKEN__ || "";
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const apiBase = process.env.NODE_ENV === "development" ? "http://localhost:7420" : "";

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/api/status`, { headers }).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      }),
      fetch(`${apiBase}/api/dev-accounts`, { headers })
        .then((res) => res.json())
        .catch(() => null)
    ])
      .then(([statusRes, accountsRes]) => {
        setData(statusRes);
        setAccountsData(accountsRes);
        setLoading(false);
      })
      .catch((err) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  if (loading)
    return <LoadingState message="Connecting to local runtime..." minHeight="60vh" />;
  if (error) {
    return (
      <EmptyState
        title="Connecting to local runtime..."
        description="The dashboard API might be starting up or is unavailable."
        command="hardkas sandbox --with-node --recipe transfer"
        icon={<FileCheck size={24} />}
      />
    );
  }
  if (!data) return null;

  const projectionDegraded =
    data.source === "artifacts" && data.sourceNote?.toLowerCase().includes("degraded");

  return (
    <div className="space-y-6">
      {/* 🚀 New Cockpit Section */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 mb-8">
        <h2 className="text-xl font-medium text-white mb-4 flex items-center gap-2">
          <span>🚀</span> Developer Cockpit
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Environment
            </h3>
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800 font-mono text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Network:</span>
                <span className="text-emerald-400">simnet</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-zinc-500">Projection:</span>
                <span
                  className={projectionDegraded ? "text-amber-400" : "text-emerald-400"}
                >
                  {projectionDegraded ? "degraded" : "healthy"}
                </span>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                Quick Commands
              </h3>
              <code className="block bg-zinc-950 p-2 rounded border border-zinc-800 text-xs text-blue-400 select-all">
                hardkas dev tx send --from alice --to bob --amount 1
              </code>
              <code className="block bg-zinc-950 p-2 rounded border border-zinc-800 text-xs text-blue-400 select-all">
                hardkas dev last --replay
              </code>
              <code className="block bg-zinc-950 p-2 rounded border border-zinc-800 text-xs text-blue-400 select-all">
                hardkas artifact inspect &lt;id&gt;
              </code>
              <code className="block bg-zinc-950 p-2 rounded border border-zinc-800 text-xs text-blue-400 select-all">
                hardkas rebuild
              </code>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Dev Accounts
            </h3>
            <div className="space-y-2">
              {accountsData?.ok && accountsData.data?.length > 0 ? (
                accountsData.data.map((acc: any) => (
                  <div
                    key={acc.name}
                    className="bg-zinc-950 p-2 rounded border border-zinc-800 text-sm flex items-center justify-between"
                  >
                    <span className="font-mono text-blue-400">{acc.name}</span>
                    <span
                      className="font-mono text-zinc-500 text-xs truncate max-w-[150px]"
                      title={acc.address}
                    >
                      {acc.address}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-zinc-500 text-sm italic">No dev accounts found.</div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <ActivityTimelineCompact />
          </div>
        </div>
      </div>

      {projectionDegraded && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-6 mb-8 flex items-start gap-4">
          <AlertTriangle className="text-amber-400 shrink-0 mt-1" />
          <div>
            <h3 className="text-amber-400 font-semibold text-lg">Projection Degraded.</h3>
            <p className="text-zinc-300 mt-1 leading-relaxed">
              Artifacts remain canonical local truth. You can verify, inspect, replay, or
              rebuild projections from them.
            </p>
            <div className="mt-3">
              <code className="bg-black/40 px-2 py-1 rounded text-amber-200 text-xs font-mono border border-amber-500/20 select-all">
                hardkas rebuild
              </code>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <FileCheck className="text-emerald-400" />
          <h2 className="text-xl font-medium">Artifact Truth Status</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono">
            Source: {data.source}
          </span>
          <span className="text-zinc-600">{data.loadedAt}</span>
        </div>
      </div>

      <p className="text-zinc-500 max-w-2xl text-sm leading-relaxed">
        The dashboard never invents truth. All status transitions are exclusively
        determined by the central semantics layer.
        {data.sourceNote && !projectionDegraded && (
          <span className="block mt-1 text-amber-400/80">{data.sourceNote}</span>
        )}
      </p>

      {!data.loaded || data.artifacts.length === 0 ? (
        <EmptyState
          title="No workflows have been executed yet"
          description={
            data.message ||
            "Run a transaction workflow to generate the causal artifact chain."
          }
          command="hardkas sandbox --with-node --recipe transfer"
          icon={<FileCheck size={24} />}
        />
      ) : (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-zinc-800/50 border-b border-zinc-800 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-6 py-3 font-medium">Artifact ID</th>
                <th className="px-6 py-3 font-medium">Canonical Status</th>
                <th className="px-6 py-3 font-medium">Semantic Hash</th>
                <th className="px-6 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.artifacts.map((a) => (
                <tr key={a.artifactId} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-6 py-4 font-mono text-white text-xs">
                    {a.artifactId}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded text-xs font-bold ${statusColors[a.canonicalStatus] || statusColors.UNKNOWN}`}
                    >
                      {a.canonicalStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-500 text-xs truncate max-w-[200px]">
                    {a.semanticHash ? a.semanticHash.substring(0, 16) + "…" : "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-500 text-xs">{a.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
