import * as React from "react";

import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-[110px] w-full rounded-3xl border border-[color:var(--border)] bg-white px-4 py-3 text-sm shadow-sm outline-none transition-colors placeholder:text-[color:var(--muted-foreground)] focus:border-[color:var(--brand)] focus:ring-4 focus:ring-[color:var(--ring)]",
        className,
      )}
      {...props}
    />
  );
}
