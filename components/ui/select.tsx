import * as React from "react";

import { cn } from "@/lib/utils";

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-2xl border border-[color:var(--border)] bg-white px-4 text-sm shadow-sm outline-none transition-colors focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:var(--ring)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

