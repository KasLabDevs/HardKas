import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';
export function App() {
    const [snapshots, setSnapshots] = useState([]);
    useEffect(() => {
        fetch('/api/snapshots').then(r => r.json()).then(setSnapshots).catch(console.error);
    }, []);
    const createSnapshot = async () => {
        const res = await fetch('/api/snapshots/create', { method: 'POST' });
        const newSnap = await res.json();
        setSnapshots((prev) => [...prev, newSnap]);
    };
    return (_jsxs(Layout, { title: "Time Travel Lab", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "State Snapshots", subtitle: "Deterministic network state captures" }), _jsxs(CardBody, { children: [_jsx("div", { className: "space-y-3", children: snapshots.length === 0 ? _jsx("p", { children: "No snapshots found." }) : snapshots.map((snap) => (_jsxs("div", { className: "p-3 bg-gray-900 rounded-lg border border-gray-800 flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-sm text-white", children: snap.name }), _jsx("div", { className: "text-xs text-gray-500", children: snap.id })] }), _jsx("div", { className: "text-right", children: _jsx(Button, { variant: "secondary", children: "Restore" }) })] }, snap.id))) }), _jsx("div", { className: "mt-6", children: _jsx(Button, { variant: "primary", className: "w-full", onClick: createSnapshot, children: "Create New Snapshot" }) })] })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Fork Sandbox", subtitle: "Branch from existing snapshots" }), _jsx(CardBody, { children: _jsxs("div", { className: "flex flex-col space-y-3", children: [_jsx(Button, { variant: "primary", children: "Branch from Genesis" }), _jsx(Button, { variant: "secondary", children: "Diff Active vs Snapshot" }), _jsx(Button, { variant: "danger", children: "Reset Localnet State" })] }) })] })] }), _jsx("div", { className: "mt-8", children: _jsx(GauntletVisualizer, {}) })] }));
}
