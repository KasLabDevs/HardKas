import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [snapshots, setSnapshots] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/snapshots').then(r => r.json()).then(setSnapshots).catch(console.error);
  }, []);

  const createSnapshot = async () => {
    const res = await fetch('/api/snapshots/create', { method: 'POST' });
    const newSnap = await res.json();
    setSnapshots((prev: any) => [...prev, newSnap]);
  };

  return (
    <Layout title="Time Travel Lab">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="State Snapshots" subtitle="Deterministic network state captures" />
          <CardBody>
            <div className="space-y-3">
              {snapshots.length === 0 ? <p>No snapshots found.</p> : snapshots.map((snap: any) => (
                <div key={snap.id} className="p-3 bg-gray-900 rounded-lg border border-gray-800 flex justify-between items-center">
                  <div>
                    <div className="font-mono text-sm text-white">{snap.name}</div>
                    <div className="text-xs text-gray-500">{snap.id}</div>
                  </div>
                  <div className="text-right">
                    <Button variant="secondary">Restore</Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6">
              <Button variant="primary" className="w-full" onClick={createSnapshot}>Create New Snapshot</Button>
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="Fork Sandbox" subtitle="Branch from existing snapshots" />
          <CardBody>
            <div className="flex flex-col space-y-3">
              <Button variant="primary">Branch from Genesis</Button>
              <Button variant="secondary">Diff Active vs Snapshot</Button>
              <Button variant="danger">Reset Localnet State</Button>
            </div>
          </CardBody>
        </Card>
      </div>
      <div className="mt-8">
        <GauntletVisualizer />
      </div>
    </Layout>
  );
}
