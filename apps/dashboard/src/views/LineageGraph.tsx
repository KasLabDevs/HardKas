import { useEffect, useState } from 'react';
import { GitMerge, ChevronRight, ChevronDown, Circle } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { LoadingState } from '../components/LoadingState';

interface LineageResponse {
  loaded: boolean;
  source: string;
  sourceNote?: string;
  loadedAt: string;
  totalNodes: number;
  totalEdges: number;
  orphanNodes?: string[];
  nodes: any[];
  edges: any[];
  truncated?: boolean;
  hiddenNodes?: number;
  message?: string;
}

interface TreeNode {
  id: string;
  label: string;
  type: string;
  status: string;
  children: TreeNode[];
  depth: number;
}

// --- Semantic classification ---

function inferArtifactType(id: string): string {
  if (id.includes('.plan.') || id.includes('-plan-')) return 'TxPlan';
  if (id.includes('.signed.') || id.includes('-signed-')) return 'SignedTx';
  if (id.includes('.receipt.') || id.includes('-receipt-')) return 'Receipt';
  if (id.includes('.replay.') || id.includes('replay')) return 'ReplayReport';
  if (id.includes('workflow') || id.includes('wf-')) return 'Workflow';
  if (id.includes('snapshot')) return 'Snapshot';
  if (id.includes('projection') || id.includes('proj-')) return 'Projection';
  return 'Artifact';
}

function classifyDetached(id: string): string {
  const type = inferArtifactType(id);
  if (type === 'ReplayReport') return 'Historical replay artifact';
  if (type === 'Snapshot') return 'Ephemeral snapshot';
  if (type === 'Projection') return 'Unreferenced projection';
  if (type === 'Receipt') return 'Detached receipt';
  return 'Pending lineage resolution';
}

function shortLabel(id: string): string {
  const parts = id.split(/[/\\]/);
  const filename = parts[parts.length - 1] || id;
  return filename
    .replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z-/, '')
    .replace(/\.json$/, '')
    .substring(0, 50);
}

function buildTree(nodes: any[], edges: any[], orphanSet: Set<string>): TreeNode[] {
  const childMap = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const e of edges) {
    const children = childMap.get(e.source) || [];
    children.push(e.target);
    childMap.set(e.source, children);
    hasParent.add(e.target);
  }

  const roots = nodes.filter(n => !hasParent.has(n.id) && !orphanSet.has(n.id));

  function buildSubtree(nodeId: string, depth: number, visited: Set<string>): TreeNode {
    if (visited.has(nodeId)) {
      return { id: nodeId, label: shortLabel(nodeId), type: 'Cycle', status: 'CYCLE', children: [], depth };
    }
    visited.add(nodeId);
    const childIds = childMap.get(nodeId) || [];
    return {
      id: nodeId,
      label: shortLabel(nodeId),
      type: inferArtifactType(nodeId),
      status: 'VERIFIED',
      children: childIds.map(cid => buildSubtree(cid, depth + 1, new Set(visited))),
      depth,
    };
  }

  return roots.slice(0, 30).map(r => buildSubtree(r.id, 0, new Set()));
}

// --- Detached artifact classification ---

interface DetachedCategory {
  label: string;
  count: number;
  description: string;
}

function classifyDetachedNodes(orphanIds: string[]): DetachedCategory[] {
  const categories: Record<string, { count: number; description: string }> = {
    'Historical replay artifacts': { count: 0, description: 'Replay reports from previous verification cycles' },
    'Ephemeral snapshots': { count: 0, description: 'Point-in-time captures not linked to active workflows' },
    'Unreferenced projections': { count: 0, description: 'Query-store projections awaiting lineage binding' },
    'Detached receipts': { count: 0, description: 'Transaction receipts from completed or rolled-back flows' },
    'Pending lineage resolution': { count: 0, description: 'Artifacts awaiting causal chain assignment' },
  };

  for (const id of orphanIds) {
    const cls = classifyDetached(id);
    if (cls === 'Historical replay artifact') categories['Historical replay artifacts'].count++;
    else if (cls === 'Ephemeral snapshot') categories['Ephemeral snapshots'].count++;
    else if (cls === 'Unreferenced projection') categories['Unreferenced projections'].count++;
    else if (cls === 'Detached receipt') categories['Detached receipts'].count++;
    else categories['Pending lineage resolution'].count++;
  }

  return Object.entries(categories)
    .filter(([, v]) => v.count > 0)
    .map(([label, v]) => ({ label, ...v }));
}

// --- Status styles ---

const statusColor: Record<string, string> = {
  VERIFIED: 'text-emerald-400',
  PROJECTED: 'text-amber-400',
  CYCLE: 'text-red-400',
};

const statusBg: Record<string, string> = {
  VERIFIED: 'bg-emerald-500/10 border-emerald-500/20',
  PROJECTED: 'bg-amber-500/10 border-amber-500/20',
  CYCLE: 'bg-red-500/10 border-red-500/20',
};

const typeBadgeColor: Record<string, string> = {
  Workflow: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  TxPlan: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
  SignedTx: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  Receipt: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  ReplayReport: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Snapshot: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  Projection: 'text-zinc-400 bg-zinc-800 border-zinc-700',
  Artifact: 'text-zinc-400 bg-zinc-800 border-zinc-700',
};

// --- Tree rendering ---

function TreeRow({ node, isLast }: { node: TreeNode; isLast: boolean }) {
  const [expanded, setExpanded] = useState(node.depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-2 px-2 hover:bg-zinc-800/50 rounded transition-colors cursor-pointer group"
        style={{ paddingLeft: `${node.depth * 24 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span className="text-zinc-700 w-4 shrink-0">
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <Circle size={5} className="ml-1.5 text-zinc-600" />}
        </span>

        <span className={`text-xs font-mono px-1.5 py-0.5 rounded border shrink-0 ${typeBadgeColor[node.type] || typeBadgeColor.Artifact}`}>
          {node.type}
        </span>

        <span className="text-white text-sm truncate">{node.label}</span>

        {hasChildren && (
          <span className="text-zinc-600 text-xs ml-1">({node.children.length})</span>
        )}

        <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ml-auto shrink-0 ${statusBg[node.status] || 'bg-zinc-800 border-zinc-700'} ${statusColor[node.status] || 'text-zinc-500'}`}>
          {node.status}
        </span>
      </div>

      {expanded && node.children.map((child, i) => (
        <TreeRow key={child.id} node={child} isLast={i === node.children.length - 1} />
      ))}
    </div>
  );
}

// --- Main component ---

export function LineageGraph() {
  const [data, setData] = useState<LineageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase = process.env.NODE_ENV === 'development' ? 'http://localhost:7420' : '';
    const token = (window as any).__HARDKAS_DEV_TOKEN__ || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    fetch(`${apiBase}/api/lineage`, { headers })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(String(err)); setLoading(false); });
  }, []);

  if (loading) return <LoadingState message="Resolving causal lineage..." minHeight="60vh" />;
  if (error) {
    return (
      <EmptyState 
        title="Connecting to local runtime..."
        description="The dashboard API might be starting up or is unavailable."
        command="hardkas sandbox --with-node --recipe transfer"
        icon={<GitMerge size={24} />}
      />
    );
  }
  if (!data) return null;

  if (!data.loaded || data.totalNodes === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-white border-b border-zinc-800 pb-4">
          <GitMerge className="text-blue-400" />
          <h2 className="text-xl font-medium">Causal Lineage</h2>
        </div>
        <EmptyState 
          title="No workflows have been executed yet"
          description={data.message || "Run a workflow to generate causal artifact chains."}
          command="hardkas sandbox --with-node --recipe transfer"
          icon={<GitMerge size={24} />}
        />
      </div>
    );
  }

  const orphanIds = data.orphanNodes || [];
  const orphanSet = new Set(orphanIds);
  const tree = buildTree(data.nodes, data.edges, orphanSet);
  const detachedCategories = classifyDetachedNodes(orphanIds);
  const connectedCount = data.totalNodes - orphanIds.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <GitMerge className="text-blue-400" />
          <h2 className="text-xl font-medium">Causal Lineage</h2>
        </div>
        <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono text-xs">
          Source: {data.source}
        </span>
      </div>

      {data.sourceNote && (
        <p className="text-amber-400/80 text-sm">{data.sourceNote}</p>
      )}

      {/* Summary */}
      <div className="flex gap-3 text-xs flex-wrap">
        <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
          <span className="text-zinc-500">Connected chains</span>
          <span className="text-white font-mono font-bold ml-2">{connectedCount}</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
          <span className="text-zinc-500">Causal edges</span>
          <span className="text-white font-mono font-bold ml-2">{data.totalEdges}</span>
        </div>
        {orphanIds.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
            <span className="text-zinc-500">Detached artifacts</span>
            <span className="text-zinc-400 font-mono font-bold ml-2">{orphanIds.length}</span>
          </div>
        )}
        {data.truncated && (
          <div className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2">
            <span className="text-zinc-500">Sampling</span>
            <span className="text-zinc-400 font-mono ml-2">{data.hiddenNodes} hidden for performance</span>
          </div>
        )}
      </div>

      {/* Causal tree */}
      {tree.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Causal Chains</h3>
            <span className="text-xs text-zinc-600">{tree.length} root{tree.length > 1 ? 's' : ''}</span>
          </div>
          <div className="p-2 overflow-auto max-h-[400px]">
            {tree.map((root, i) => (
              <TreeRow key={root.id} node={root} isLast={i === tree.length - 1} />
            ))}
          </div>
        </div>
      )}

      {/* Detached artifact classification */}
      {detachedCategories.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white uppercase tracking-wider">Detached Artifacts</h3>
              <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded font-mono uppercase font-semibold">Info</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
              Detached artifacts are expected for historical or completed workflows. These represent inactive caches, projection indices, or ephemeral replay snapshots not currently participating in active execution chains.
            </p>
          </div>
          <div className="divide-y divide-zinc-800">
            {detachedCategories.map(cat => (
              <div key={cat.label} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-white text-sm">{cat.label}</span>
                  <span className="text-zinc-600 text-xs block">{cat.description}</span>
                </div>
                <span className="text-zinc-400 font-mono text-sm">{cat.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
