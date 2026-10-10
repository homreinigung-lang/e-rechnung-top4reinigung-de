import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { type LvProcessStep } from "@/lib/lv-analyse/types";

export function StepIcon({ state }: { state: LvProcessStep["state"] }) {
  if (state === "ok") return <CheckCircle2 className="size-4 text-emerald-600" />;
  if (state === "warn") return <AlertTriangle className="size-4 text-amber-600" />;
  if (state === "error") return <XCircle className="size-4 text-destructive" />;
  return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
}
