import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-gray-800/40 backdrop-blur-xl border border-gray-700/50 rounded-2xl shadow-xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, className = '' }: { title: string, subtitle?: string, className?: string }) {
  return (
    <div className={`px-6 py-5 border-b border-gray-700/50 bg-gray-900/40 ${className}`}>
      <h3 className="text-xl font-bold text-white tracking-tight">{title}</h3>
      {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
    </div>
  );
}

export function CardBody({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={`px-6 py-5 text-gray-300 ${className}`}>
      {children}
    </div>
  );
}
