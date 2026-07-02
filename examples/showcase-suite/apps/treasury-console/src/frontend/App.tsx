import React, { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';

export function App() {
  const [jobs, setJobs] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/jobs').then(r => r.json()).then(setJobs).catch(console.error);
  }, []);

  const runPayout = async () => {
    await fetch('/api/payouts/create', { method: 'POST' });
    alert('Batch payout scheduled in HardKAS Job Manager.');
  };

  return (
    <Layout title="Treasury Console">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Batch Payouts" subtitle="Automated employee / affiliate disbursements" />
          <CardBody>
            <div className="space-y-4">
               <div className="p-4 bg-gray-900 rounded-lg border border-gray-800">
                  <div className="text-sm text-gray-400">Total Pending Payouts</div>
                  <div className="text-3xl font-bold text-white mt-1">1,204 KAS</div>
               </div>
            </div>
            <div className="mt-6">
              <Button variant="primary" className="w-full" onClick={runPayout}>Approve & Execute Batch</Button>
            </div>
          </CardBody>
        </Card>
        
        <Card>
          <CardHeader title="Job Execution Engine" subtitle="Resumable HardKAS tasks" />
          <CardBody>
            <div className="space-y-3">
              {jobs.length === 0 ? <p>No active jobs.</p> : jobs.map(job => (
                <div key={job.id} className="p-3 bg-gray-900 rounded-lg border border-gray-800">
                  <div className="flex justify-between">
                    <span className="font-mono text-sm text-white">{job.id}</span>
                    <span className={`text-xs font-bold uppercase ${job.status === 'completed' ? 'text-emerald-400' : 'text-blue-400'}`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 mt-3">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(job.currentStep / job.steps) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex space-x-3">
              <Button variant="secondary">Resume Pending</Button>
              <Button variant="danger">Halt All</Button>
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
