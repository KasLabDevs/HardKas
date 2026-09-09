import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  const base = "px-4 py-2 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900";
  
  const variants = {
    primary: "bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white focus:ring-emerald-500",
    secondary: "bg-white/10 hover:bg-white/20 text-white border border-white/20 focus:ring-gray-400",
    danger: "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 text-white focus:ring-red-500"
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}
