import { Star } from "lucide-react";
import { ReviewStarRating } from "./ReviewStarRating";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface StarDistribution {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

interface ReviewSummaryCardProps {
  average: number;
  total: number;
  distribution: StarDistribution;
  onWriteReview: () => void;
  canWriteReview: boolean;
}

export function ReviewSummaryCard({
  average,
  total,
  distribution,
  onWriteReview,
  canWriteReview,
}: ReviewSummaryCardProps) {
  const maxCount = Math.max(...Object.values(distribution), 1);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start gap-4">
          <div className="flex flex-col items-center">
            <p className="text-4xl font-bold text-[#0A0A0A]">{average.toFixed(1)}</p>
            <ReviewStarRating value={Math.round(average)} onChange={() => {}} size={16} readOnly />
            <p className="text-xs text-[#0A0A0A]/40 mt-1">{total} review{total !== 1 ? "s" : ""}</p>
          </div>

          <div className="flex-1 space-y-1.5 pt-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = distribution[String(star) as keyof StarDistribution] ?? 0;
              const pct = total > 0 ? (count / maxCount) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-3 text-[#0A0A0A]/50">{star}</span>
                  <Star size={10} className="text-[#C9A84C] fill-[#C9A84C]" />
                  <div className="flex-1 h-2 bg-[#F0F0F0] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#C9A84C] rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-6 text-right text-[#0A0A0A]/40">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {canWriteReview && (
          <Button
            variant="outline"
            className="w-full gap-2 border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/5"
            onClick={onWriteReview}
          >
            <Star size={16} /> Write a Review
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
