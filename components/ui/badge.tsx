import * as React from "react";

import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-[color:var(--border)] bg-white/75 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted-foreground)]",
        className,
      )}
      {...props}
    />
  );
}

