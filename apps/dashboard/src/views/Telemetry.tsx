import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';

interface TelemetryResponse {
  loaded: boolean;
  source: string;
  loadedAt: string;
  message?: string;
  totalAnomalies: number;
  countsByType: Record<string, number>;
  countsByBucket: Record<string, number>;
  recentEvents: any[];
  eventsFallback?: boolean;
  eventsFallbackNote?: string;
}

interface PressureGauge {
  label: string;
  value: number | null;
  status: 'nominal' | 'elevated' | 'critical' | 'inactive';
  description: string;
}

const gaugeStyle: Record<string, { color: string; bg: string; dot: string; icon: string }> = {
  nominal:  { color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/15', dot: 'bg-emerald-400', icon: '●' },
  elevated: { color: 'text-amber-400',   bg: 'bg-amber-500/5 border-amber-500/15',     dot: 'bg-amber-400',   icon: '▲' },
  critical: { color: 'text-red-400',     bg: 'bg-red-500/5 border-red-500/15',         dot: 'bg-red-400',     icon: '✕' },
  inactive: { color: 'text-zinc-600',    bg: 'bg-zinc-900 border-zinc-800',            dot: 'bg-zinc-700',    icon: '○' },
};

function buildGauges(data: TelemetryResponse): PressureGauge[] {
  if (!data.loaded) {
    return [
      { label: 'Lock Contention',       value: null, status: 'inactive', description: 'Concurrent access pressure on workspace locks' },
      { label: 'Stale Lock Recovery',   value: null, status: 'inactive', description: 'Locks recovered from interrupted processes' },
      { label: 'Replay Reconciliation', value: null, status: 'inactive', description: 'Replay results reconciled against canonical state' },
      { label: 'External Mutation',     value: null, status: 'inactive', description: 'Artifacts modified outside HardKAS control' },
      { label: 'FS Retry',             value: null, status: 'inactive', description: 'Filesystem operations requiring retry' },
      { label: 'Quarantine Rate',       value: null, status: 'inactive', description: 'Artifacts isolated per verification cycle' },
    ];
  }

  const c = data.countsByType;
  const g = (key: string, warn: number, crit: number): 'nominal' | 'elevated' | 'critical' => {
    const v = c[key] || 0;
    if (v >= crit) return 'critical';
    if (v >= warn) return 'elevated';
    return 'nominal';
  };

  return [
    { label: 'Lock Contention',       value: c['LOCK_CONTENTION'] || 0,       status: g('LOCK_CONTENTION', 50, 200),       description: 'Concurrent access pressure on workspace locks' },
    { label: 'Stale Lock Recovery',   value: c['STALE_LOCK_RECOVERY'] || 0,   status: g('STALE_LOCK_RECOVERY', 10, 50),    description: 'Locks recovered from interrupted processes' },
    { label: 'Replay Reconciliation', value: c['REPLAY_RECONCILIATION'] || 0, status: g('REPLAY_RECONCILIATION', 5, 20),   description: 'Replay results reconciled against canonical state' },
    { label: 'External Mutation',     value: c['EXTERNAL_MUTATION'] || 0,     status: g('EXTERNAL_MUTATION', 1, 5),        description: 'Artifacts modified outside HardKAS control' },
    { label: 'FS Retry',             value: c['FS_RETRY'] || 0,             status: g('FS_RETRY', 20, 100),              description: 'Filesystem operations requiring retry' },
    { label: 'Quarantine Rate',       value: c['QUARANTINE'] || 0,           status: g('QUARANTINE', 1, 5),               description: 'Artifacts isolated per verification cycle' },
  ];
}

export function Telemetry() {
  const [data, setData] = useState<TelemetryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NODE_ENV === 'development' ? 'http://localhost:7420' : '';
    const token = (window as any).__HARDKAS_DEV_TOKEN__ || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    fetch(`${apiBase}/api/telemetry`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  if (loading) return <div className="text-zinc-500">Sampling runtime pressure...</div>;
  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-4">
          <Cpu className="text-blue-400" />
          <h2 className="text-xl font-medium">Runtime Pressure</h2>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg text-center">
          <p className="text-zinc-400 font-medium">Connecting to local runtime or no telemetry available.</p>
        </div>
      </div>
    );
  }

  const gauges = buildGauges(data);
  const allNominal = gauges.every(g => g.status === 'nominal');
  const allInactive = gauges.every(g => g.status === 'inactive');

  // Overall status
  let overallStatus = 'Nominal';
  let overallColor = 'text-emerald-400';
  let overallDot = 'bg-emerald-400';
  let overallBg = 'bg-emerald-500/5 border-emerald-500/20';

  if (allInactive) {
    overallStatus = 'Awaiting Initialization';
    overallColor = 'text-zinc-500';
    overallDot = 'bg-zinc-600';
    overallBg = 'bg-zinc-900 border-zinc-800';
  } else if (gauges.some(g => g.status === 'critical')) {
    overallStatus = 'Critical';
    overallColor = 'text-red-400';
    overallDot = 'bg-red-400';
    overallBg = 'bg-red-500/5 border-red-500/20';
  } else if (gauges.some(g => g.status === 'elevated')) {
    overallStatus = 'Elevated';
    overallColor = 'text-amber-400';
    overallDot = 'bg-amber-400';
    overallBg = 'bg-amber-500/5 border-amber-500/20';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <Cpu className="text-blue-400" />
          <h2 className="text-xl font-medium">Runtime Pressure</h2>
        </div>
        <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono text-xs">
          Source: {data.source === "none" ? "telemetry/telemetry.jsonl missing" : data.source}
        </span>
      </div>

      {/* Overall status banner */}
      <div className={`rounded-lg p-5 border ${overallBg}`}>
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${overallDot}`} />
          <h3 className={`font-medium text-lg ${overallColor}`}>
            Runtime Pressure: {overallStatus}
          </h3>
          {data.loaded && data.totalAnomalies > 0 && (
            <span className="ml-auto text-zinc-500 font-mono text-sm">{data.totalAnomalies} events recorded</span>
          )}
        </div>
        {allInactive && (
          <div className="mt-4 ml-5 space-y-3">
            <p className="text-zinc-400 text-sm">
              Runtime pressure telemetry is not initialized yet. stress-test locks, trigger concurrent executions, and track performance anomalies by running the chaos-matrix suite:
            </p>
            <div className="bg-zinc-950 border border-zinc-800/80 rounded px-4 py-3 font-mono text-xs text-emerald-400 flex items-center justify-between max-w-lg shadow-inner">
              <span>pnpm hardkas torture matrix</span>
              <span className="text-zinc-600 text-[10px] uppercase font-semibold tracking-wider">Recovery Command</span>
            </div>
            {data.eventsFallback && (
              <span className="block mt-2 text-zinc-500 text-xs">{data.eventsFallbackNote}</span>
            )}
          </div>
        )}
      </div>

      {/* Pressure gauges */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {gauges.map(g => {
          const s = gaugeStyle[g.status];
          return (
            <div key={g.label} className={`rounded-lg p-4 border ${s.bg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-zinc-400 text-xs uppercase tracking-wider">{g.label}</span>
                <span className={`text-xs ${s.color}`}>{s.icon} {g.status}</span>
              </div>
              <span className={`font-mono text-xl ${g.value === null ? 'text-zinc-700' : s.color}`}>
                {g.value === null ? '—' : g.value}
              </span>
              <p className="text-zinc-600 text-xs mt-2">{g.description}</p>
            </div>
          );
        })}
      </div>

      {/* Subsystem stress distribution */}
      {data.loaded && Object.keys(data.countsByBucket).length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Subsystem Stress Distribution</h3>
          </div>
          <div className="p-4 space-y-2">
            {Object.entries(data.countsByBucket).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([bucket, count]) => {
              const max = Math.max(...Object.values(data.countsByBucket));
              const pct = max > 0 ? (count / max) * 100 : 0;
              return (
                <div key={bucket} className="flex items-center gap-3 text-sm">
                  <span className="text-zinc-500 text-xs w-52 shrink-0 truncate font-mono">{bucket}</span>
                  <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-blue-500/50 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-zinc-500 font-mono text-xs w-10 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
