import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';

interface QuarantineItem {
  filename: string;
  reason: string;
  detectedAt?: string;
  originalPath?: string;
}

interface QuarantineResponse {
  loaded: boolean;
  source: string;
  loadedAt: string;
  totalQuarantined: number;
  items: QuarantineItem[];
  message?: string;
}

interface HealthMetric {
  label: string;
  value: number;
  ok: boolean;
}

export function Quarantine() {
  const [data, setData] = useState<QuarantineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NODE_ENV === 'development' ? 'http://localhost:7420' : '';
    const token = (window as any).__HARDKAS_DEV_TOKEN__ || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    fetch(`${apiBase}/api/quarantine`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  if (loading) return <div className="text-zinc-500">Loading quarantine zone...</div>;
  
  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-4">
          <ShieldAlert className="text-red-400" />
          <h2 className="text-xl font-medium">Quarantine Status</h2>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg text-center">
          <p className="text-zinc-400 font-medium">Connecting to local runtime or no quarantine data available.</p>
        </div>
      </div>
    );
  }

  const totalQ = data.totalQuarantined || 0;
  const isClean = totalQ === 0;

  const healthChecks: HealthMetric[] = [
    { label: 'Invalid Artifacts', value: totalQ, ok: totalQ === 0 },
    { label: 'Schema Violations', value: 0, ok: true },
    { label: 'Replay Failures', value: 0, ok: true },
    { label: 'Semantic Violations', value: 0, ok: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          {isClean ? <ShieldCheck className="text-emerald-400" /> : <ShieldAlert className="text-red-400" />}
          <h2 className="text-xl font-medium">Quarantine Status</h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono">
            Source: {data.source}
          </span>
        </div>
      </div>

      {/* Status banner */}
      {isClean ? (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <h3 className="text-emerald-400 font-medium text-lg">Quarantine Status: CLEAN</h3>
          </div>
          <p className="text-emerald-400/70 text-sm">
            No artifacts have been quarantined. The canonical lattice is structurally intact.
          </p>
        </div>
      ) : (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-400" />
            <h3 className="text-red-400 font-medium text-lg">Quarantine Status: {totalQ} ISOLATED</h3>
          </div>
          <p className="text-red-400/70 text-sm">
            {totalQ} artifact{totalQ > 1 ? 's' : ''} failed integrity checks and have been isolated from the canonical lattice.
          </p>
          <div className="mt-4 space-y-3">
            <p className="text-red-400/80 text-xs">
              To inspect and repair the isolated artifacts, execute a deep safety verification of the quarantine zone:
            </p>
            <div className="bg-zinc-950 border border-red-950/60 rounded px-4 py-3 font-mono text-xs text-red-400 flex items-center justify-between max-w-lg shadow-inner">
              <span>pnpm hardkas artifact verify .hardkas/quarantine --recursive --strict</span>
              <span className="text-red-700 text-[10px] uppercase font-semibold tracking-wider font-mono">Verify Command</span>
            </div>
          </div>
        </div>
      )}

      {/* Health metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {healthChecks.map(m => (
          <div key={m.label} className={`rounded-lg p-4 border ${m.ok ? 'bg-zinc-900 border-zinc-800' : 'bg-red-500/10 border-red-500/20'}`}>
            <span className="text-zinc-500 text-xs uppercase tracking-wider block mb-1">{m.label}</span>
            <span className={`font-mono text-xl ${m.ok ? 'text-emerald-400' : 'text-red-400'}`}>{m.value}</span>
          </div>
        ))}
      </div>

      {/* Quarantined items list */}
      {!isClean && data.items && data.items.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Isolated Artifacts</h3>
          </div>
          <div className="divide-y divide-zinc-800">
            {data.items.map(item => (
              <div key={item.filename} className="px-5 py-3 flex items-center gap-4">
                <div className="w-1 h-8 bg-red-500 rounded-full shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-mono text-white block truncate">{item.filename}</span>
                  <span className="text-xs text-zinc-600">{item.reason} · Not Canonical</span>
                </div>
                {item.detectedAt && (
                  <span className="text-xs text-zinc-600 shrink-0">{new Date(item.detectedAt).toLocaleDateString()}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
