'use client';

import React, { useRef } from 'react';
import { cn } from '@/lib/utils';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverable?: boolean;
  glow?: boolean;
  as?: React.ElementType;
}

export function GlassCard({
  children,
  className,
  hoverable = true,
  glow = false,
  as: Component = 'div',
  ...props
}: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!glow || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    cardRef.current.style.setProperty('--x', `${x}px`);
    cardRef.current.style.setProperty('--y', `${y}px`);
  };

  return (
    <Component
      ref={cardRef}
      onMouseMove={handleMouseMove}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--glass-border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-[var(--glass-shadow)] backdrop-blur-[var(--glass-blur)] transition-all duration-300 ease-out group",
        hoverable && "hover:-translate-y-0.5 hover:border-[rgba(121,194,27,0.25)] hover:shadow-md dark:hover:border-[rgba(116,180,25,0.3)]",
        className
      )}
      {...props}
    >
      {/* 3D Glass edge highlight reflection */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.25)] to-transparent dark:via-[rgba(255,255,255,0.06)] pointer-events-none rounded-t-xl" />
      
      {/* Mouse tracking aura/glow overlay */}
      {glow && (
        <div 
          className="pointer-events-none absolute -inset-px opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-[radial-gradient(circle_at_var(--x,50%)_var(--y,50%),rgba(121,194,27,0.08)_0%,transparent_50%)] dark:bg-[radial-gradient(circle_at_var(--x,50%)_var(--y,50%),rgba(116,180,25,0.12)_0%,transparent_50%)]"
          style={{ mixBlendMode: 'screen' }}
        />
      )}
      
      <div className="relative z-10">
        {children}
      </div>
    </Component>
  );
}
