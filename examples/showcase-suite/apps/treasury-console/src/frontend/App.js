import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';
export function App() {
    const [jobs, setJobs] = useState([]);
    useEffect(() => {
        fetch('/api/jobs').then(r => r.json()).then(setJobs).catch(console.error);
    }, []);
    const runPayout = async () => {
        await fetch('/api/payouts/create', { method: 'POST' });
        alert('Batch payout scheduled in HardKAS Job Manager.');
    };
    return (_jsxs(Layout, { title: "Treasury Console", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Batch Payouts", subtitle: "Automated employee / affiliate disbursements" }), _jsxs(CardBody, { children: [_jsx("div", { className: "space-y-4", children: _jsxs("div", { className: "p-4 bg-gray-900 rounded-lg border border-gray-800", children: [_jsx("div", { className: "text-sm text-gray-400", children: "Total Pending Payouts" }), _jsx("div", { className: "text-3xl font-bold text-white mt-1", children: "1,204 KAS" })] }) }), _jsx("div", { className: "mt-6", children: _jsx(Button, { variant: "primary", className: "w-full", onClick: runPayout, children: "Approve & Execute Batch" }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Job Execution Engine", subtitle: "Resumable HardKAS tasks" }), _jsxs(CardBody, { children: [_jsx("div", { className: "space-y-3", children: jobs.length === 0 ? _jsx("p", { children: "No active jobs." }) : jobs.map((job) => (_jsxs("div", { className: "p-3 bg-gray-900 rounded-lg border border-gray-800", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "font-mono text-sm text-white", children: job.id }), _jsx("span", { className: `text-xs font-bold uppercase ${job.status === 'completed' ? 'text-emerald-400' : 'text-blue-400'}`, children: job.status })] }), _jsx("div", { className: "w-full bg-gray-700 rounded-full h-2 mt-3", children: _jsx("div", { className: "bg-emerald-500 h-2 rounded-full", style: { width: `${(job.currentStep / job.steps) * 100}%` } }) })] }, job.id))) }), _jsxs("div", { className: "mt-6 flex space-x-3", children: [_jsx(Button, { variant: "secondary", children: "Resume Pending" }), _jsx(Button, { variant: "danger", children: "Halt All" })] })] })] })] }), _jsx("div", { className: "mt-8", children: _jsx(GauntletVisualizer, {}) })] }));
}
