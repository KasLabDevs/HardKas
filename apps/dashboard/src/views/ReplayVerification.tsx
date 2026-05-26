import { useEffect, useState } from 'react';
import { ShieldCheck, History, Terminal } from 'lucide-react';

interface ReplayResponse {
  loaded: boolean;
  source: string;
  loadedAt: string;
  replayAvailable: boolean;
  lastReplayStatus?: string;
  totalInvariantChecks?: number | null;
  passedInvariantChecks?: number | null;
  failedInvariantChecks?: number | null;
  globalSemanticHash?: string | null;
  replayHash?: string | null;
  reportFilesFound?: number;
  commandSuggestion?: string;
  message?: string;
  statusSummary?: Record<string, number>;
}

export function ReplayVerification() {
  const [data, setData] = useState<ReplayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3333/api/replay')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  if (loading) return <div className="text-zinc-500">Loading replay status...</div>;
  if (error) return <div className="text-red-400">API Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <History className="text-emerald-400" />
          <h2 className="text-xl font-medium">Replay Verification Panel</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono">
            Source: {data.source}
          </span>
        </div>
      </div>

      {!data.replayAvailable ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg text-center space-y-4">
          <History className="h-12 w-12 opacity-20 mx-auto" />
          <p className="text-zinc-400 font-medium">{data.message || 'No replay report found.'}</p>
          {data.commandSuggestion && (
            <div className="max-w-md mx-auto space-y-2 mt-4 text-left">
              <span className="text-zinc-500 text-xs font-medium block">To verify and compile your semantic replay proof:</span>
              <div className="bg-zinc-950 border border-zinc-800/80 rounded px-4 py-3 font-mono text-xs text-emerald-400 flex items-center justify-between shadow-inner">
                <span>{data.commandSuggestion}</span>
                <span className="text-zinc-600 text-[10px] uppercase font-semibold tracking-wider font-mono">Verify Command</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <span className="text-zinc-500 block text-xs mb-1 uppercase tracking-wider">Status</span>
              <span className={`text-lg font-bold ${data.lastReplayStatus === 'PASS' ? 'text-emerald-400' : data.lastReplayStatus === 'FAIL' ? 'text-red-400' : 'text-amber-400'}`}>
                {data.lastReplayStatus || 'UNKNOWN'}
              </span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <span className="text-zinc-500 block text-xs mb-1 uppercase tracking-wider">Total Checks</span>
              <span className="text-white font-mono text-lg">{data.totalInvariantChecks ?? '—'}</span>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-5">
              <span className="text-emerald-400 block text-xs mb-1 uppercase tracking-wider font-bold">Passed</span>
              <span className="text-emerald-400 font-mono text-lg">{data.passedInvariantChecks ?? '—'}</span>
            </div>
            <div className={`rounded-lg p-5 ${(data.failedInvariantChecks ?? 0) > 0 ? 'bg-red-500/10 border border-red-500/20' : 'bg-zinc-900 border border-zinc-800'}`}>
              <span className="text-zinc-500 block text-xs mb-1 uppercase tracking-wider">Failed</span>
              <span className={`font-mono text-lg ${(data.failedInvariantChecks ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                {data.failedInvariantChecks ?? '—'}
              </span>
            </div>
          </div>

          {data.globalSemanticHash && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <span className="text-zinc-500 block text-xs mb-2 uppercase tracking-wider">Global Semantic Hash</span>
              <code className="text-emerald-400 font-mono text-sm break-all select-all bg-emerald-500/10 px-2 py-1 rounded">
                {data.globalSemanticHash}
              </code>
            </div>
          )}

          {data.statusSummary && Object.keys(data.statusSummary).length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-white mb-3 uppercase tracking-wider">Status Summary</h3>
              <div className="flex flex-wrap gap-3">
                {Object.entries(data.statusSummary).map(([status, count]) => (
                  <div key={status} className="bg-zinc-800 border border-zinc-700 px-3 py-2 rounded text-sm">
                    <span className="text-zinc-400 font-mono">{status}</span>
                    <span className="text-white font-bold ml-2">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
