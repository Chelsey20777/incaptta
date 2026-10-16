'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, type LucideIcon } from 'lucide-react';

interface QuickLinkProps {
  icon: LucideIcon;
  iconColor: string;
  title: string;
  subtitle: string;
  href?: string;
}

export function QuickLink({ icon: Icon, iconColor, title, subtitle, href }: QuickLinkProps) {
  const router = useRouter();

  return (
    <div
      className="p-4 rounded-xl bg-muted/30 border border-border/40 hover:bg-muted/50 cursor-pointer transition-all flex items-center justify-between group"
      onClick={() => href && router.push(href)}
    >
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-${iconColor}-500/10`}>
          <Icon className={`size-4 text-${iconColor}-500`} />
        </div>
        <div>
          <p className="text-sm font-bold">{title}</p>
          <p className="text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
    </div>
  );
}