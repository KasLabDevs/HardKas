import React, { useState, useMemo } from "react";
import { useEvents, useOverview } from "@hardkas/react";
import { 
  Activity, 
  Terminal, 
  Database, 
  FileCode, 
  Wifi, 
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  LayoutList
} from "lucide-react";
import { EmptyState } from "../components/EmptyState";

export function EventsPage() {
  const { data, isLoading } = useEvents();
  const { data: overview } = useOverview();
  const events = data?.events;
  const observabilityDrift = overview?.runtimeState === "DEGRADED" || overview?.runtimeState === "PENDING" || data?.observabilityDrift;
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedCorrelation, setExpandedCorrelation] = useState<string | null>(null);

  // Group events by correlationId
  const groupedEvents = useMemo(() => {
    if (!events) return [];
    
    const groups = new Map<string, any[]>();
    
    events.forEach(event => {
      const cid = event.correlationId || "unknown";
      if (!groups.has(cid)) {
        groups.set(cid, []);
      }
      groups.get(cid)!.push(event);
    });

    // Sort events within each group by timestamp ascending
    for (const [cid, group] of groups.entries()) {
      group.sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeA - timeB;
      });
    }

    // Convert map to array and sort groups by the timestamp of their latest event (descending)
    return Array.from(groups.entries()).map(([correlationId, groupEvents]) => {
      const latestTime = Math.max(...groupEvents.map(e => e.timestamp ? new Date(e.timestamp).getTime() : 0));
      return {
        correlationId,
        events: groupEvents,
        latestTime
      };
    }).sort((a, b) => b.latestTime - a.latestTime);
  }, [events]);

  const filteredGroups = groupedEvents.filter(group => {
    const term = searchTerm.toLowerCase();
    if (group.correlationId.toLowerCase().includes(term)) return true;
    return group.events.some(e => 
      e.kind.toLowerCase().includes(term) || 
      (e.sourceSubsystem && e.sourceSubsystem.toLowerCase().includes(term))
    );
  });

  const getDomainIcon = (domain: string) => {
    switch (domain) {
      case "workflow": return <Activity size={14} className="text-indigo-400" />;
      case "integrity": return <Terminal size={14} className="text-red-400" />;
      case "sqlite": return <Database size={14} className="text-emerald-400" />;
      case "artifact": return <FileCode size={14} className="text-amber-400" />;
      case "rpc": return <Wifi size={14} className="text-cyan-400" />;
      default: return <Activity size={14} className="text-zinc-400" />;
    }
  };

  const getEventColor = (kind: string) => {
    if (kind.includes("error") || kind.includes("fail") || kind.includes("corrupt") || kind.includes("mismatch")) {
      return "text-red-400 bg-red-500/10 border-red-500/20";
    }
    if (kind.includes("started") || kind.includes("sync")) {
      return "text-sky-400 bg-sky-500/10 border-sky-500/20";
    }
    if (kind.includes("completed") || kind.includes("receipt") || kind.includes("verified")) {
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
    }
    if (kind.includes("written") || kind.includes("indexed")) {
      return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    }
    return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            Causal Event Ledger
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            Low-level deterministic event sourcing stream across the entire HardKAS node architecture.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search events, subsystems, correlations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-sans"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-24 bg-zinc-900/30 border border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const isExpanded = expandedCorrelation === group.correlationId;
            const primaryDomain = group.events[0]?.domain || "unknown";
            
            return (
              <div 
                key={group.correlationId}
                className="bg-zinc-900/40 border border-zinc-850 rounded-2xl overflow-hidden shadow-sm hover:border-zinc-700/80 transition-all duration-300"
              >
                {/* Group Header */}
                <div 
                  className="px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/30 transition-colors select-none"
                  onClick={() => setExpandedCorrelation(isExpanded ? null : group.correlationId)}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-zinc-950 rounded-xl border border-zinc-800 shadow-inner">
                      {getDomainIcon(primaryDomain)}
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-200 font-mono tracking-tight">
                          Workflow Group
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500 px-1.5 py-0.5 bg-zinc-950 rounded border border-zinc-900">
                          {group.events.length} events
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-zinc-500">
                        Correlation ID: <span className="text-indigo-400">{group.correlationId}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono text-zinc-500 flex items-center gap-1">
                      <Clock size={12} />
                      {group.events[group.events.length - 1].timestamp ? new Date(group.events[group.events.length - 1].timestamp!).toLocaleTimeString() : '—'}
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                  </div>
                </div>

                {/* Expanded Events Timeline */}
                {isExpanded && (
                  <div className="border-t border-zinc-800/80 bg-zinc-950/40 p-6">
                    <div className="relative border-l-2 border-zinc-800/80 ml-3 pl-6 space-y-6">
                      {group.events.map((event, i) => (
                        <div key={event.eventId || i} className="relative">
                          {/* Timeline Dot */}
                          <div className="absolute -left-[31px] top-1.5 w-3 h-3 bg-zinc-900 border-2 border-indigo-500 rounded-full shadow-[0_0_8px_rgba(99,102,241,0.4)]" />
                          
                          <div className="bg-zinc-900 border border-zinc-800/80 rounded-xl p-4 hover:border-zinc-700 transition-colors shadow-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/60 pb-3">
                              <div className="flex items-center gap-2">
                                {getDomainIcon(event.domain)}
                                <span className="text-xs font-bold text-zinc-200 tracking-wide">{event.domain}</span>
                                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${getEventColor(event.kind)}`}>
                                  {event.kind}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                                <Clock size={10} />
                                {event.timestamp ? new Date(event.timestamp).toISOString().split('T')[1].replace('Z','') : '—'}
                              </span>
                            </div>
                            
                            <div className="space-y-1.5 mt-2 text-[10px] font-mono text-zinc-400">
                              {event.txId && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-zinc-600">txId</span>
                                  <span className="text-zinc-300 truncate" title={event.txId}>{event.txId}</span>
                                </div>
                              )}
                              {event.artifactId && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-zinc-600">artifactId</span>
                                  <span className="text-zinc-300 truncate" title={event.artifactId}>{event.artifactId}</span>
                                </div>
                              )}
                            </div>
                            
                            {/* Payload inspect */}
                            {event.payload && Object.keys(event.payload).length > 0 && (
                              <details className="mt-3 group/payload">
                                <summary className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 cursor-pointer flex items-center gap-1 hover:text-zinc-300 transition-colors">
                                  <Terminal size={10} /> View Payload
                                </summary>
                                <div className="mt-2 p-2 bg-zinc-950 rounded border border-zinc-900/60 overflow-x-auto">
                                  <pre className="text-[9px] font-mono text-indigo-300/80 m-0">
                                    {JSON.stringify(event.payload, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : observabilityDrift && overview?.counts?.artifacts ? (
        <div className="bg-amber-950/20 border border-amber-900/50 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
            <Activity size={32} className="text-amber-400" />
          </div>
          <h2 className="text-lg font-black text-amber-100 mb-2 tracking-tight">Causal Events Missing</h2>
          <p className="text-sm text-amber-400/80 max-w-md mb-6 leading-relaxed">
            Runtime artifacts exist, but no causal events were found for them. This might be a legacy workspace, or the event ledger was disabled.
          </p>
          <div className="bg-zinc-950 border border-zinc-900 rounded-lg p-3 w-full max-w-md flex flex-col gap-2 font-mono text-xs">
            <span className="text-zinc-500 uppercase tracking-wider text-[9px] font-sans font-bold">Run to Rebuild:</span>
            <span className="text-amber-300">hardkas query store rebuild</span>
          </div>
        </div>
      ) : (
        <EmptyState
          title="No events yet."
          description="Run a transaction to generate causal events."
          command="hardkas tx send --from alice --to bob --amount 10 --yes"
          icon={<Activity size={32} />}
        />
      )}
    </div>
  );
}
