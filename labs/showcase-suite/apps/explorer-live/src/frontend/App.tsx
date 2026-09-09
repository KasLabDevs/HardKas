import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [stats, setStats] = useState<any>(null);
  const [blocks, setBlocks] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/dag/stats').then(r => r.json()).then(setStats).catch(console.error);
    fetch('/api/dag/blocks').then(r => r.json()).then(setBlocks).catch(console.error);
  }, []);

  return (
    <Layout title="Explorer Live">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
          <Card>
            <CardHeader title="DAG Stats" />
            <CardBody>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                  <span className="text-gray-400">Blue Score</span>
                  <span className="text-blue-400 font-mono font-bold">{stats?.blueScore || '...'}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                  <span className="text-gray-400">Tips</span>
                  <span className="text-pink-400 font-mono font-bold">{stats?.tips || '...'}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg border border-gray-800">
                  <span className="text-gray-400">Difficulty</span>
                  <span className="text-yellow-400 font-mono font-bold">{stats?.difficulty || '...'}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="md:col-span-2">
          <Card>
            <CardHeader title="Recent Blocks" subtitle="Live stream of DAG updates" />
            <CardBody>
              <div className="space-y-3">
                {blocks.length === 0 ? <p>No blocks found.</p> : blocks.map((b: any) => (
                  <div key={b.hash} className="p-3 bg-gray-900 rounded-lg border border-gray-800 flex justify-between items-center hover:border-emerald-500/50 transition-colors cursor-pointer">
                    <div>
                      <div className="font-mono text-sm text-emerald-400">{b.hash}</div>
                      <div className="text-xs text-gray-500">{new Date(Number(b.timestamp)).toLocaleTimeString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">Score {b.blueScore}</div>
                      <div className="text-xs text-gray-400">{b.txCount} TXs</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
      <div className="mt-8">
        <GauntletVisualizer />
      </div>
    </Layout>
  );
}
