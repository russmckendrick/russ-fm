import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const metadataBadgeVariants = cva(
  "inline-flex items-center rounded-full border font-medium transition-all",
  {
    variants: {
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-3 py-1 text-xs",
        lg: "px-4 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)

export interface MetadataBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof metadataBadgeVariants> {
  children: React.ReactNode
}

function MetadataBadge({
  children,
  size,
  className,
  ...props
}: MetadataBadgeProps) {
  return (
    <span
      className={cn(
        metadataBadgeVariants({ size }),
        // Light mode styles
        "bg-muted/50 border-border text-foreground",
        // Dark mode styles (same as light for consistency)
        "dark:bg-muted/50 dark:border-border dark:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

export { MetadataBadge, metadataBadgeVariants }
