import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';
export function App() {
    const [templates, setTemplates] = useState([]);
    useEffect(() => {
        fetch('/api/templates').then(r => r.json()).then(setTemplates).catch(console.error);
    }, []);
    const simulate = async () => {
        const res = await fetch('/api/simulate', { method: 'POST' });
        const result = await res.json();
        alert(`Simulation Result: ${result.message}\nCompute Budget: ${result.computeBudget}`);
    };
    return (_jsxs(Layout, { title: "Silver Playground", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Silver Templates", subtitle: "Pre-audited covenant abstractions" }), _jsx(CardBody, { children: _jsx("div", { className: "space-y-3", children: templates.length === 0 ? _jsx("p", { children: "No templates loaded." }) : templates.map((t) => (_jsxs("div", { className: "p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-emerald-500/50 cursor-pointer", children: [_jsx("div", { className: "font-bold text-white", children: t.name }), _jsx("div", { className: "text-xs text-gray-500 mt-1", children: t.description })] }, t.id))) }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Simulation Sandbox", subtitle: "V1 Guard enforcement & Execution" }), _jsx(CardBody, { children: _jsxs("div", { className: "flex flex-col h-full justify-between", children: [_jsx("div", { className: "bg-black/50 border border-gray-700/50 rounded-lg p-4 font-mono text-sm text-gray-400 h-32 mb-4", children: '// Instantiated Template Config\n{ \n  "type": "time_lock", \n  "daaThreshold": 15000 \n}' }), _jsxs("div", { className: "flex space-x-3", children: [_jsx(Button, { variant: "primary", className: "flex-1", onClick: simulate, children: "Run Local Simulation" }), _jsx(Button, { variant: "secondary", children: "Check V1 Bounds" })] })] }) })] })] }), _jsx("div", { className: "mt-8", children: _jsx(GauntletVisualizer, {}) })] }));
}
