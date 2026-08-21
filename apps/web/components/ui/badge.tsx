import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-7 w-fit shrink-0 items-center justify-center gap-1.5 rounded-[8px] border px-2.5 py-1 font-mono text-[10px] font-medium leading-none tracking-[0.02em] whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground",
        secondary:
          "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-background text-muted-foreground",
        positive:
          "border-positive/25 bg-positive-subtle text-positive",
        destructive:
          "border-destructive/25 bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
