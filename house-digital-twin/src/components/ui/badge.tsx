import * as React from "react";
import { cn } from "@/lib/utils";
import type { VerificationStatus } from "@/types/geometry";

const STYLES: Record<VerificationStatus, string> = {
  verified: "bg-verified/15 text-verified border-verified/40",
  unverified: "bg-unverified/15 text-unverified border-unverified/40",
  conflict: "bg-conflict/15 text-conflict border-conflict/40",
};
const LABEL: Record<VerificationStatus, string> = { verified: "Verified", unverified: "Unverified", conflict: "Conflict" };

export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium", className)} {...props} />;
}

export function StatusBadge({ status, className }: { status: VerificationStatus; className?: string }) {
  return <Badge className={cn(STYLES[status], className)}>{LABEL[status]}</Badge>;
}
