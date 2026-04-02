import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
  {
    variants: {
      variant: {
        default:
          "bg-[color:var(--brand)] px-4 py-2 text-white hover:bg-[color:var(--brand-strong)]",
        secondary:
          "bg-[color:var(--surface-strong)] px-4 py-2 text-[color:var(--foreground)] hover:bg-[color:var(--surface-strong-hover)]",
        outline:
          "border border-[color:var(--border)] bg-white/80 px-4 py-2 text-[color:var(--foreground)] hover:bg-white",
        ghost:
          "px-3 py-2 text-[color:var(--foreground)] hover:bg-white/70",
      },
      size: {
        default: "h-11",
        sm: "h-9 px-3 text-xs",
        lg: "h-12 px-5 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

