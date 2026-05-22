import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewStarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  size?: number;
  readOnly?: boolean;
}

export function ReviewStarRating({ value, onChange, size = 28, readOnly = false }: ReviewStarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0);

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hoverValue > 0 ? star <= hoverValue : star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHoverValue(star)}
            onMouseLeave={() => !readOnly && setHoverValue(0)}
            onClick={() => !readOnly && onChange(star)}
            className={cn(
              "transition-transform",
              !readOnly && "hover:scale-110 cursor-pointer",
              readOnly && "cursor-default"
            )}
          >
            <Star
              size={size}
              className={cn(
                "transition-colors",
                filled
                  ? "text-[#C9A84C] fill-[#C9A84C]"
                  : "text-gray-300 fill-transparent"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
