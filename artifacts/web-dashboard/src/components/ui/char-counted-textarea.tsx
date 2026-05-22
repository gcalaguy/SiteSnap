import * as React from "react"
import { cn } from "@/lib/utils"
import { Textarea } from "@/components/ui/textarea"

interface CharCountedTextareaProps extends React.ComponentProps<"textarea"> {
  maxLength: number;
}

const CharCountedTextarea = React.forwardRef<HTMLTextAreaElement, CharCountedTextareaProps>(
  ({ maxLength, onChange, value, className, ...props }, ref) => {
    const currentLength = typeof value === "string" ? value.length : 0;
    const isAtLimit = currentLength >= maxLength;
    const isNearLimit = currentLength >= Math.floor(maxLength * 0.8);

    function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
      const sliced = e.target.value.slice(0, maxLength);
      if (e.target.value !== sliced) {
        e.target.value = sliced;
      }
      onChange?.(e);
    }

    return (
      <div className="space-y-1">
        <Textarea
          ref={ref}
          maxLength={maxLength}
          value={value}
          onChange={handleChange}
          className={cn(isAtLimit && "border-destructive focus-visible:ring-destructive", className)}
          {...props}
        />
        <p
          className={cn(
            "text-xs text-right tabular-nums",
            isAtLimit
              ? "text-destructive font-medium"
              : isNearLimit
                ? "text-amber-500"
                : "text-muted-foreground",
          )}
        >
          {currentLength.toLocaleString()}/{maxLength.toLocaleString()}
        </p>
      </div>
    );
  },
);
CharCountedTextarea.displayName = "CharCountedTextarea";

export { CharCountedTextarea };
export type { CharCountedTextareaProps };
