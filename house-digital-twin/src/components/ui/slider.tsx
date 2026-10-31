"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

type Props = { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; className?: string; label?: string };

export function Slider({ value, onChange, min = 0, max = 1, step = 0.05, className, label }: Props) {
  return (
    <input
      type="range"
      aria-label={label}
      className={cn("h-1.5 w-full cursor-pointer accent-primary", className)}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}
