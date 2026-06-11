import { Star, User } from "lucide-react";
import { ReviewStarRating } from "./ReviewStarRating";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ReviewItem {
  id: number;
  reviewerName: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
}

interface ReviewFeedListProps {
  reviews: ReviewItem[];
  hasMore?: boolean;
  onLoadMore?: () => void;
}

export function ReviewFeedList({ reviews, hasMore, onLoadMore }: ReviewFeedListProps) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-[#0A0A0A]/40">
        No reviews yet. Be the first to leave feedback!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((review) => {
        const initials = review.reviewerName
          ?.split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase() ?? "??";

        return (
          <div
            key={review.id}
            className="flex gap-3 p-4 rounded-xl bg-white border border-[#F0F0F0] hover:border-[#E5E5E5] transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-[#C9A84C]/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[#C9A84C]">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[#0A0A0A]">{review.reviewerName}</span>
                <ReviewStarRating value={review.rating} onChange={() => {}} size={14} readOnly />
                <span className="text-xs text-[#0A0A0A]/40">
                  {formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                </span>
              </div>
              {review.comment && (
                <p className="text-sm text-[#0A0A0A]/70 mt-1.5 leading-relaxed">{review.comment}</p>
              )}
            </div>
          </div>
        );
      })}

      {hasMore && onLoadMore && (
        <button
          onClick={onLoadMore}
          className="w-full py-2.5 text-sm text-[#C9A84C] hover:bg-[#C9A84C]/5 rounded-lg transition-colors"
        >
          Load more reviews
        </button>
      )}
    </div>
  );
}
