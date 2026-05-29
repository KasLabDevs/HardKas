import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

interface BundleResponse {
  loaded: boolean;
  source: string;
  bundlePath?: string;
  bundleType?: string;
  loadedAt: string;
  generatedAt?: string;
  schemaVersion?: string;
  runtimeVersion?: string;
  hashVersion?: string;
  globalSemanticHash?: string;
  totalInvariantChecks?: number;
  passedChecks?: number;
  failedChecks?: number;
  uniqueArtifacts?: number;
  excludedNoiseFields?: string[];
  statusSummary?: Record<string, number>;
  message?: string;
}

export function Bundles() {
  const [data, setData] = useState<BundleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NODE_ENV === "development" ? "http://localhost:7420" : "";
    const token = (window as any).__HARDKAS_DEV_TOKEN__ || "";
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`${apiBase}/api/bundles`, { headers })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        // A fetch error or 404 means no bundle yet or API starting. We treat it as empty.
        setError(String(err));
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="text-zinc-500">Loading semantic bundle...</div>;

  // If there's an error (like connection refused) or empty data, show the empty state
  if (error || !data || !data.loaded) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-4">
          <Layers className="text-blue-400" />
          <h2 className="text-xl font-medium">Semantic Bundle v1 Viewer</h2>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg text-center">
          <p className="text-zinc-400 font-medium">
            No semantic bundle found for this workspace.
          </p>
          <p className="text-sm text-zinc-600 mt-2">
            Run:{" "}
            <code className="text-emerald-400 bg-black/40 px-2 py-1 rounded select-all">
              hardkas verify-semantics --workspace &lt;sandbox&gt;
            </code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <Layers className="text-blue-400" />
          <h2 className="text-xl font-medium">Semantic Bundle v1 Viewer</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono">
            Source: {data.source}
          </span>
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded font-mono">
            {data.bundleType || "local"} bundle
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-zinc-900 rounded-lg p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
            Bundle Identity
          </h3>
          <div className="space-y-4 text-sm">
            <div>
              <span className="text-zinc-500 block text-xs mb-1">
                Global Semantic Hash
              </span>
              <code className="text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded break-all select-all text-xs">
                {data.globalSemanticHash || "—"}
              </code>
            </div>
            <div>
              <span className="text-zinc-500 block text-xs mb-1">Schema Version</span>
              <span className="text-white font-mono">{data.schemaVersion || "—"}</span>
            </div>
            <div>
              <span className="text-zinc-500 block text-xs mb-1">Runtime Version</span>
              <span className="text-white font-mono">{data.runtimeVersion || "—"}</span>
            </div>
            {data.generatedAt && (
              <div>
                <span className="text-zinc-500 block text-xs mb-1">Generated At</span>
                <span className="text-white font-mono text-xs">{data.generatedAt}</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 rounded-lg p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
            Invariant Summary
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
              <span className="text-zinc-500 block text-xs mb-1">Total Checks</span>
              <span className="text-white font-mono text-lg">
                {data.totalInvariantChecks ?? 0}
              </span>
            </div>
            <div className="bg-emerald-500/10 p-3 rounded border border-emerald-500/20">
              <span className="text-emerald-400 block text-xs mb-1 font-bold">
                Passed
              </span>
              <span className="text-emerald-400 font-mono text-lg">
                {data.passedChecks ?? 0}
              </span>
            </div>
            <div className="bg-zinc-950 p-3 rounded border border-zinc-800">
              <span className="text-zinc-500 block text-xs mb-1">Unique Artifacts</span>
              <span className="text-white font-mono text-lg">
                {data.uniqueArtifacts ?? 0}
              </span>
            </div>
            <div
              className={`p-3 rounded ${(data.failedChecks ?? 0) > 0 ? "bg-red-500/10 border border-red-500/20" : "bg-zinc-950 border border-zinc-800"}`}
            >
              <span className="text-zinc-500 block text-xs mb-1">Failed</span>
              <span
                className={`font-mono text-lg ${(data.failedChecks ?? 0) > 0 ? "text-red-400" : "text-white"}`}
              >
                {data.failedChecks ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {data.excludedNoiseFields && data.excludedNoiseFields.length > 0 && (
        <div className="bg-zinc-900 rounded-lg p-5 border border-zinc-800">
          <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider">
            Excluded Noise Fields
          </h3>
          <div className="flex flex-wrap gap-2">
            {data.excludedNoiseFields.map((field) => (
              <span
                key={field}
                className="bg-zinc-950 border border-zinc-800 text-zinc-500 px-3 py-1 rounded-full text-xs font-mono"
              >
                {field}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
