import { useEffect, useState } from 'react';
import { GitMerge, ArrowRight, ShieldCheck, FileText, Activity } from 'lucide-react';

interface LineageResponse {
  loaded: boolean;
  source: string;
  sourceNote?: string;
  loadedAt: string;
  totalNodes: number;
  totalEdges: number;
  nodes: any[];
  edges: any[];
  message?: string;
}

interface WfNode {
  id: string;
  type: string;
  status: string;
}

interface WorkflowChain {
  plan?: WfNode;
  signed?: WfNode;
  receipt?: WfNode;
  replay?: WfNode;
}

function inferArtifactType(id: string): string {
  if (id.includes('.plan.') || id.includes('-plan-')) return 'plan';
  if (id.includes('.signed.') || id.includes('-signed-')) return 'signed';
  if (id.includes('.receipt.') || id.includes('-receipt-')) return 'receipt';
  if (id.includes('.replay.') || id.includes('replay')) return 'replay';
  return 'other';
}

function extractWorkflowChains(nodes: any[], edges: any[]): WorkflowChain[] {
  const nodeMap = new Map<string, any>();
  nodes.forEach(n => nodeMap.set(n.id, n));

  const childMap = new Map<string, string[]>();
  edges.forEach(e => {
    const children = childMap.get(e.source) || [];
    children.push(e.target);
    childMap.set(e.source, children);
  });

  // Find root plans
  const chains: WorkflowChain[] = [];
  const visited = new Set<string>();

  nodes.forEach(n => {
    const type = inferArtifactType(n.id);
    if (type === 'plan' && !visited.has(n.id)) {
      const chain: WorkflowChain = { plan: { id: n.id, type, status: 'VERIFIED' } };
      visited.add(n.id);

      const searchNext = (parentId: string, targetType: string): WfNode | undefined => {
        const children = childMap.get(parentId) || [];
        for (const cid of children) {
          if (inferArtifactType(cid) === targetType) {
            visited.add(cid);
            return { id: cid, type: targetType, status: 'VERIFIED' };
          }
        }
        return undefined;
      };

      chain.signed = searchNext(n.id, 'signed');
      if (chain.signed) {
        chain.receipt = searchNext(chain.signed.id, 'receipt');
        if (chain.receipt) {
          chain.replay = searchNext(chain.receipt.id, 'replay');
        }
      }

      chains.push(chain);
    }
  });

  return chains;
}

const getIcon = (type: string) => {
  if (type === 'plan') return <FileText size={18} className="text-violet-400" />;
  if (type === 'signed') return <ShieldCheck size={18} className="text-cyan-400" />;
  if (type === 'receipt') return <ShieldCheck size={18} className="text-emerald-400" />;
  if (type === 'replay') return <Activity size={18} className="text-amber-400" />;
  return <FileText size={18} className="text-zinc-400" />;
};

const getColor = (type: string) => {
  if (type === 'plan') return 'border-violet-500/30 bg-violet-500/10 text-violet-400';
  if (type === 'signed') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400';
  if (type === 'receipt') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  if (type === 'replay') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  return 'border-zinc-700 bg-zinc-800 text-zinc-400';
};

const getLabel = (type: string) => {
  if (type === 'plan') return 'TxPlan';
  if (type === 'signed') return 'SignedTx';
  if (type === 'receipt') return 'Receipt';
  if (type === 'replay') return 'Replay Report';
  return 'Artifact';
};

function WorkflowNode({ node, missing }: { node?: WfNode; missing: string }) {
  if (!node) {
    return (
      <div className="flex flex-col items-center gap-2 opacity-30">
        <div className={`w-12 h-12 rounded-full border-2 border-dashed border-zinc-700 bg-zinc-900/50 flex items-center justify-center`}>
          {getIcon(missing)}
        </div>
        <span className="text-xs text-zinc-600 uppercase tracking-wider font-semibold">{getLabel(missing)}</span>
        <span className="text-[10px] text-zinc-700 font-mono">Pending</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2 relative group">
      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${getColor(node.type)} shadow-lg`}>
        {getIcon(node.type)}
      </div>
      <span className="text-xs text-zinc-300 uppercase tracking-wider font-semibold">{getLabel(node.type)}</span>
      <span className="text-[10px] text-zinc-500 font-mono truncate max-w-[100px]" title={node.id}>
        {node.id.substring(0, 8)}...
      </span>
    </div>
  );
}

export function WorkflowGraph() {
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

  if (loading) return <div className="text-zinc-500">Resolving workflows...</div>;
  if (error) return <div className="text-red-400">API Error: {error}</div>;
  if (!data) return null;

  const chains = extractWorkflowChains(data.nodes || [], data.edges || []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2 text-white">
          <GitMerge className="text-blue-400" />
          <h2 className="text-xl font-medium">Transaction Workflow Graph</h2>
        </div>
        <span className="bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-1 rounded font-mono text-xs">
          Source: {data.source}
        </span>
      </div>

      <p className="text-zinc-500 max-w-2xl text-sm leading-relaxed">
        This view extracts well-formed transaction workflows (`Plan → Signed → Receipt → Replay`) from the general causal lineage.
      </p>

      {chains.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg text-center">
          <p className="text-zinc-400 font-medium">No complete workflows found.</p>
          <p className="text-zinc-600 text-sm mt-2">Run a transaction workflow to generate the causal artifact chain.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {chains.map((chain, idx) => (
            <div key={idx} className="bg-zinc-900 border border-zinc-800 p-8 rounded-lg overflow-x-auto">
              <div className="min-w-max flex items-center justify-center gap-4">
                <WorkflowNode node={chain.plan} missing="plan" />
                <div className={`h-0.5 w-16 ${chain.signed ? 'bg-zinc-600' : 'bg-zinc-800'}`}></div>
                <WorkflowNode node={chain.signed} missing="signed" />
                <div className={`h-0.5 w-16 ${chain.receipt ? 'bg-zinc-600' : 'bg-zinc-800'}`}></div>
                <WorkflowNode node={chain.receipt} missing="receipt" />
                <div className={`h-0.5 w-16 ${chain.replay ? 'bg-zinc-600' : 'bg-zinc-800'}`}></div>
                <WorkflowNode node={chain.replay} missing="replay" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
