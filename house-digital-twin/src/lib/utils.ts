import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = (v: number | null | undefined, d = 2) => (v === null || v === undefined ? "–" : v.toFixed(d));
export const fmtLevel = (v: number | null | undefined) => (v === null || v === undefined ? "–" : (v >= 0 ? "+" : "") + v.toFixed(2));
