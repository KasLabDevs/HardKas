import { useEffect, useState } from 'react';
import { FileCheck } from 'lucide-react';

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
  VERIFIED: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
  REPLAY_VERIFIED: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
  PROJECTED: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  STALE: 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
  CORRUPTED: 'bg-red-500/10 text-red-400 border border-red-500/20',
  QUARANTINED: 'bg-red-500/10 text-red-400 border border-red-500/20',
  UNKNOWN: 'bg-zinc-800 text-zinc-500 border border-zinc-700',
};

export function TruthStatus() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3333/api/status')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  if (loading) return <div className="text-zinc-500">Loading truth lattice...</div>;
  if (error) return <div className="text-red-400">API Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
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
        The dashboard never invents truth. All status transitions are exclusively determined by the central semantics layer.
        {data.sourceNote && <span className="block mt-1 text-amber-400/80">{data.sourceNote}</span>}
      </p>

      {!data.loaded || data.artifacts.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg text-center">
          <p className="text-zinc-400 font-medium">{data.message || 'No canonical artifacts found in current workspace.'}</p>
        </div>
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
                  <td className="px-6 py-4 font-mono text-white text-xs">{a.artifactId}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${statusColors[a.canonicalStatus] || statusColors.UNKNOWN}`}>
                      {a.canonicalStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-zinc-500 text-xs truncate max-w-[200px]">
                    {a.semanticHash ? a.semanticHash.substring(0, 16) + '…' : '—'}
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
