import * as React from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-[color:var(--border)] bg-white px-4 text-sm shadow-sm outline-none transition-colors placeholder:text-[color:var(--muted-foreground)] focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}

