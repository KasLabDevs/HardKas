import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { Layout, Card, CardHeader, CardBody, Button, GauntletVisualizer } from '@showcase/shared-ui';
export function App() {
    const [invoices, setInvoices] = useState([]);
    useEffect(() => {
        fetch('/api/invoices').then(r => r.json()).then(setInvoices).catch(console.error);
    }, []);
    const createInvoice = async () => {
        const res = await fetch('/api/invoices/create', { method: 'POST' });
        const newInvoice = await res.json();
        setInvoices((prev) => [...prev, newInvoice]);
    };
    return (_jsxs(Layout, { title: "Merchant Terminal", children: [_jsxs("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6", children: [_jsxs(Card, { children: [_jsx(CardHeader, { title: "Point of Sale", subtitle: "Create new payment requests" }), _jsx(CardBody, { children: _jsxs("div", { className: "flex flex-col items-center justify-center space-y-6 py-8", children: [_jsx("div", { className: "text-6xl font-bold text-white", children: "100.00 KAS" }), _jsx(Button, { variant: "primary", className: "w-full text-lg py-4", onClick: createInvoice, children: "Generate Invoice" })] }) })] }), _jsxs(Card, { children: [_jsx(CardHeader, { title: "Recent Invoices", subtitle: "Live payment reconciliation status" }), _jsx(CardBody, { children: _jsx("div", { className: "space-y-3", children: invoices.length === 0 ? _jsx("p", { children: "No invoices." }) : invoices.map((inv) => (_jsxs("div", { className: "p-3 bg-gray-900 rounded-lg border border-gray-800 flex justify-between items-center", children: [_jsxs("div", { children: [_jsx("div", { className: "font-mono text-sm text-gray-300", children: inv.id }), _jsx("div", { className: "text-xs text-gray-500", children: new Date(Number(inv.createdAt)).toLocaleString() })] }), _jsxs("div", { className: "text-right", children: [_jsxs("div", { className: "font-bold text-white", children: [Number(inv.amountSompi) / 100000000, " KAS"] }), _jsx("div", { className: `text-xs font-bold uppercase ${inv.status === 'paid' ? 'text-emerald-400' : 'text-yellow-400'}`, children: inv.status })] })] }, inv.id))) }) })] })] }), _jsx("div", { className: "mt-8", children: _jsx(GauntletVisualizer, {}) })] }));
}
