"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = { checked: boolean; onChange: () => void; label: React.ReactNode; className?: string };

export function Checkbox({ checked, onChange, label, className }: Props) {
  return (
    <label className={cn("flex cursor-pointer select-none items-center gap-2 text-sm", className)}>
      <input type="checkbox" className="size-3.5 accent-primary" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
