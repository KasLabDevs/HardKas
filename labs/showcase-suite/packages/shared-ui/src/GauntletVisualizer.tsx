import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardBody } from './Card';
import { Button } from './Button';

interface ActorState {
    id: number;
    label: string;
    op: string;
    status: 'idle' | 'running' | 'done' | 'error';
}

export function GauntletVisualizer() {
    const [statusMessage, setStatusMessage] = useState<string>('Ready');
    const [actors, setActors] = useState<Record<number, ActorState>>({});
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        if (!isRunning) return;

        const sse = new EventSource('http://localhost:4001/api/gauntlet/stream');
        
        sse.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'STATUS') {
                setStatusMessage(data.message);
                if (data.message.includes('complete') || data.message.includes('failed')) {
                    setIsRunning(false);
                    sse.close();
                }
            } else if (data.type === 'ACTOR_READY') {
                setActors(prev => ({
                    ...prev,
                    [data.id]: { id: data.id, label: data.label, op: 'Ready', status: 'idle' }
                }));
            } else if (data.type === 'OP_START') {
                setActors(prev => ({
                    ...prev,
                    [data.id]: { ...prev[data.id], op: data.op, status: 'running' }
                }));
            } else if (data.type === 'OP_DONE') {
                setActors(prev => ({
                    ...prev,
                    [data.id]: { ...prev[data.id], op: data.op, status: 'done' }
                }));
            } else if (data.type === 'OP_ERROR') {
                setActors(prev => ({
                    ...prev,
                    [data.id]: { ...prev[data.id], op: data.op, status: 'error' }
                }));
            }
        };

        sse.onerror = () => {
            sse.close();
            setIsRunning(false);
        };

        return () => {
            sse.close();
        };
    }, [isRunning]);

    const startGauntlet = async () => {
        setActors({});
        setStatusMessage('Connecting...');
        setIsRunning(true);
        try {
            await fetch('http://localhost:4001/api/gauntlet/start', { method: 'POST' });
        } catch (e: any) {
            setStatusMessage(`Failed to start: ${e.message}`);
            setIsRunning(false);
        }
    };

    return (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 to-black border border-gray-800 shadow-[0_0_50px_-12px_rgba(16,185,129,0.15)]">
            <div className="absolute top-0 right-0 p-32 bg-emerald-500/10 blur-[100px] rounded-full pointer-events-none" />
            
            <div className="relative p-6 lg:p-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-white/5 pb-6">
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 to-cyan-400 tracking-tight">
                            Real-Time Execution Gauntlet
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">
                            Live telemetry against deterministic HardKAS Simnet infrastructure
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
                            <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-gray-500'}`} />
                            <span className="text-xs font-mono text-gray-300 truncate max-w-[200px]">{statusMessage}</span>
                        </div>
                        <button 
                            className={`px-6 py-2.5 rounded-xl font-medium transition-all duration-300 shadow-lg ${
                                isRunning 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-not-allowed'
                                : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black border border-transparent shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5'
                            }`}
                            onClick={startGauntlet}
                            disabled={isRunning}
                        >
                            {isRunning ? 'Synthesizing...' : 'Launch Sequence'}
                        </button>
                    </div>
                </div>
                
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {Object.values(actors).map(actor => (
                        <div 
                            key={actor.id} 
                            className={`group relative p-4 rounded-xl backdrop-blur-sm border transition-all duration-500 overflow-hidden ${
                                actor.status === 'running' ? 'bg-emerald-950/40 border-emerald-500/50 scale-[1.02] shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]' :
                                actor.status === 'error' ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_20px_-5px_rgba(239,68,68,0.2)]' :
                                actor.status === 'done' ? 'bg-black/60 border-emerald-900/40' :
                                'bg-black/40 border-gray-800/50'
                            }`}
                        >
                            {actor.status === 'running' && (
                                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent opacity-50 animate-[shimmer_1s_infinite]" />
                            )}
                            <div className="flex justify-between items-start mb-3">
                                <div className="text-xs font-semibold tracking-wider text-gray-400 uppercase">{actor.label}</div>
                                {actor.status === 'error' && <div className="text-xs text-red-400">FAILED</div>}
                                {actor.status === 'done' && <div className="text-xs text-emerald-500 font-bold">OK</div>}
                            </div>
                            <div className={`text-[13px] font-mono truncate ${
                                actor.status === 'error' ? 'text-red-400 font-medium' : 
                                actor.status === 'running' ? 'text-emerald-300 font-medium' :
                                'text-gray-300'
                            }`}>
                                {actor.op}
                            </div>
                        </div>
                    ))}
                </div>
                
                {Object.keys(actors).length === 0 && !isRunning && (
                    <div className="py-20 flex flex-col items-center justify-center text-center border border-dashed border-gray-800/50 rounded-xl bg-black/20 backdrop-blur-sm">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                            <svg className="w-8 h-8 text-emerald-500/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-medium text-gray-200 mb-2">Awaiting Ignition</h3>
                        <p className="text-gray-500 text-sm max-w-sm">
                            Initiate the gauntlet to orchestrate 10 concurrent actors executing massive transactional load against the local DAG.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
