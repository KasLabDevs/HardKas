import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [output, setOutput] = useState<string>('');

  const runDoctor = async () => {
    setOutput('Running HardKAS Doctor...');
    const res = await fetch('/api/cli/doctor', { method: 'POST' });
    const result = await res.json();
    setOutput(result.message || result.error);
  };

  const runEnvCheck = async () => {
    setOutput('Running HardKAS Env Check...');
    const res = await fetch('/api/cli/env-check', { method: 'POST' });
    const result = await res.json();
    setOutput(result.message || result.error);
  };

  return (
    <Layout title="CLI Studio">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="CLI Runners" subtitle="Direct execution of CLI binaries in Node" />
          <CardBody>
            <div className="flex flex-col space-y-3">
              <Button variant="primary" onClick={runDoctor}>Run hardkas doctor</Button>
              <Button variant="secondary" onClick={runEnvCheck}>Run hardkas env check</Button>
              <Button variant="secondary">Run hardkas deploy init</Button>
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="CLI Output Terminal" subtitle="Execution results" />
          <CardBody>
            <div className="bg-black border border-gray-700/50 rounded-lg p-4 font-mono text-sm text-emerald-400 h-64 overflow-y-auto">
              {output || '> Waiting for command...'}
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
