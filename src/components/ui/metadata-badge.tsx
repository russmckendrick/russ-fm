import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Editorial metadata chip — sharp corners, hairline rule, mono uppercase.
 * Used for label/value fragments (YEAR, FORMAT, CAT., etc.) on detail
 * heroes and cards.
 */
const metadataBadgeVariants = cva(
  "inline-flex items-center border font-mono uppercase tracking-[0.06em]",
  {
    variants: {
      size: {
        sm: "px-1.5 py-[3px] text-[10px]",
        md: "px-2 py-[3px] text-[11px]",
        lg: "px-2.5 py-1 text-[12px]",
      },
      tone: {
        default: "bg-paper text-ink border-rule-strong",
        muted: "bg-paper-2 text-ink-3 border-rule",
        ghost: "bg-transparent text-ink-3 border-rule",
      },
    },
    defaultVariants: {
      size: "md",
      tone: "default",
    },
  }
);

export interface MetadataBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof metadataBadgeVariants> {
  children: React.ReactNode;
}

function MetadataBadge({
  children,
  size,
  tone,
  className,
  ...props
}: MetadataBadgeProps) {
  return (
    <span
      className={cn(metadataBadgeVariants({ size, tone }), className)}
      {...props}
    >
      {children}
    </span>
  );
}

export { MetadataBadge };
