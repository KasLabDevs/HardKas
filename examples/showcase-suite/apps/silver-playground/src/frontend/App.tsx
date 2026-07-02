import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(setTemplates).catch(console.error);
  }, []);

  const simulate = async () => {
    const res = await fetch('/api/simulate', { method: 'POST' });
    const result = await res.json();
    alert(`Simulation Result: ${result.message}\nCompute Budget: ${result.computeBudget}`);
  };

  return (
    <Layout title="Silver Playground">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Silver Templates" subtitle="Pre-audited covenant abstractions" />
          <CardBody>
            <div className="space-y-3">
              {templates.length === 0 ? <p>No templates loaded.</p> : templates.map((t: any) => (
                <div key={t.id} className="p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-emerald-500/50 cursor-pointer">
                  <div className="font-bold text-white">{t.name}</div>
                  <div className="text-xs text-gray-500 mt-1">{t.description}</div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="Simulation Sandbox" subtitle="V1 Guard enforcement & Execution" />
          <CardBody>
            <div className="flex flex-col h-full justify-between">
              <div className="bg-black/50 border border-gray-700/50 rounded-lg p-4 font-mono text-sm text-gray-400 h-32 mb-4">
                {'// Instantiated Template Config\n{ \n  "type": "time_lock", \n  "daaThreshold": 15000 \n}'}
              </div>
              <div className="flex space-x-3">
                <Button variant="primary" className="flex-1" onClick={simulate}>Run Local Simulation</Button>
                <Button variant="secondary">Check V1 Bounds</Button>
              </div>
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
