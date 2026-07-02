import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';
export function App() {
    const [output, setOutput] = useState('');
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
    return (_jsxs(Layout, { title: "CLI Studio", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "CLI Runners", subtitle: "Direct execution of CLI binaries in Node" }), _jsx(CardBody, { children: _jsxs("div", { className: "flex flex-col space-y-3", children: [_jsx(Button, { variant: "primary", onClick: runDoctor, children: "Run hardkas doctor" }), _jsx(Button, { variant: "secondary", onClick: runEnvCheck, children: "Run hardkas env check" }), _jsx(Button, { variant: "secondary", children: "Run hardkas deploy init" })] }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "CLI Output Terminal", subtitle: "Execution results" }), _jsx(CardBody, { children: _jsx("div", { className: "bg-black border border-gray-700/50 rounded-lg p-4 font-mono text-sm text-emerald-400 h-64 overflow-y-auto", children: output || '> Waiting for command...' }) })] })] }), _jsx("div", { className: "mt-8", children: _jsx(GauntletVisualizer, {}) })] }));
}
