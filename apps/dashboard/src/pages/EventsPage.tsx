import React, { useState, useMemo } from "react";
import { useEvents } from "@hardkas/react";
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
  const { data: events, isLoading } = useEvents();
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
      e.domain.toLowerCase().includes(term) ||
      (e.txId && e.txId.toLowerCase().includes(term)) ||
      (e.artifactId && e.artifactId.toLowerCase().includes(term))
    );
  });

  const getDomainIcon = (domain: string) => {
    switch (domain) {
      case "core": return <Activity size={14} className="text-indigo-400" />;
      case "indexer": return <Database size={14} className="text-amber-400" />;
      case "fs": return <FileCode size={14} className="text-emerald-400" />;
      case "server": return <Wifi size={14} className="text-sky-400" />;
      case "cli": return <Terminal size={14} className="text-purple-400" />;
      default: return <Activity size={14} className="text-zinc-400" />;
    }
  };

  const getDomainColor = (domain: string) => {
    switch (domain) {
      case "core": return "text-indigo-400 bg-indigo-500/10 border-indigo-500/20";
      case "indexer": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "fs": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "server": return "text-sky-400 bg-sky-500/10 border-sky-500/20";
      case "cli": return "text-purple-400 bg-purple-500/10 border-purple-500/20";
      default: return "text-zinc-400 bg-zinc-500/10 border-zinc-500/20";
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-zinc-800">
        <div>
          <h1 className="text-xl font-black text-zinc-100 flex items-center gap-2 tracking-tight">
            System Events Timeline
          </h1>
          <p className="text-xs text-zinc-400 mt-1 leading-normal">
            Introspection and observability for the deterministic runtime. Events are grouped by correlation lifecycle.
          </p>
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search events, kinds, txs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 font-sans"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(n => (
            <div key={n} className="h-24 bg-zinc-900/20 border border-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filteredGroups.length > 0 ? (
        <div className="space-y-4">
          {filteredGroups.map(group => {
            const isExpanded = expandedCorrelation === group.correlationId;
            const toggle = () => setExpandedCorrelation(isExpanded ? null : group.correlationId);

            return (
              <div key={group.correlationId} className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden transition-all duration-300">
                <div 
                  className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/30 transition-colors"
                  onClick={toggle}
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800">
                      <LayoutList size={18} className="text-zinc-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-200">Correlation Lifecycle</span>
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-900">
                          {group.correlationId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-mono uppercase text-zinc-500">
                          {group.events.length} events
                        </span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-1">
                          <Clock size={10} /> 
                          {new Date(group.latestTime).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 self-start sm:self-center">
                    <div className="flex -space-x-2">
                      {Array.from(new Set(group.events.map(e => e.domain))).map(domain => (
                        <div key={domain} className="w-6 h-6 rounded-full bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center" title={`Domain: ${domain}`}>
                          {getDomainIcon(domain as string)}
                        </div>
                      ))}
                    </div>
                    {isExpanded ? <ChevronUp size={16} className="text-zinc-500 ml-2" /> : <ChevronDown size={16} className="text-zinc-500 ml-2" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-6 border-t border-zinc-800/80 bg-zinc-950/30">
                    <div className="relative pl-4 space-y-6 before:absolute before:inset-0 before:ml-[23px] before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-zinc-800 before:via-zinc-800 before:to-transparent">
                      {group.events.map((event, idx) => (
                        <div key={event.eventId} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group/event is-active">
                          {/* Timeline Icon Marker */}
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-4 border-zinc-950 shrink-0 md:order-1 md:group-odd/event:-translate-x-1/2 md:group-even/event:translate-x-1/2 bg-zinc-900 shadow-[0_0_0_1px_rgba(255,255,255,0.05)] z-10 ${
                            event.kind.includes('error') || event.kind.includes('corrupted') 
                              ? 'text-red-400 shadow-red-500/20' 
                              : 'text-zinc-400'
                          }`}>
                            {getDomainIcon(event.domain)}
                          </div>
                          
                          {/* Event Card */}
                          <div className="w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/40 shadow-sm hover:border-zinc-700/80 transition-all">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border uppercase tracking-wider ${getDomainColor(event.domain)}`}>
                                {event.kind}
                              </span>
                              <span className="text-[9px] font-mono text-zinc-500 flex items-center gap-1">
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
                              {event.causationId && (
                                <div className="flex justify-between gap-2">
                                  <span className="text-zinc-600">causationId</span>
                                  <span className="text-zinc-500 truncate" title={event.causationId}>{event.causationId}</span>
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
      ) : (
        <EmptyState
          title="No Events Found"
          description="We couldn't find any system events. Try running a transaction or check if the localnet is active."
          command="hardkas doctor"
          icon={<Activity size={32} />}
        />
      )}
    </div>
  );
}
