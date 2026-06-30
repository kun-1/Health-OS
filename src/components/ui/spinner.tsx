import * as React from "react";

import { cn } from "@/lib/utils";

function Spinner({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-label="Loading"
      data-slot="spinner"
      role="status"
      className={cn(
        "inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export { Spinner };
