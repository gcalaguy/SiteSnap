import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ReviewStarRating } from "./ReviewStarRating";

interface ReviewFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
  isSubmitting: boolean;
  targetName: string;
}

export function ReviewFormModal({ open, onClose, onSubmit, isSubmitting, targetName }: ReviewFormModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  function handleSubmit() {
    if (rating === 0) return;
    onSubmit(rating, comment);
    setRating(0);
    setComment("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-white border-[#E5E5E5]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-[#0A0A0A]">
            Write a Review
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 mt-2">
          <p className="text-sm text-[#0A0A0A]/60">
            How was your experience with <span className="font-medium text-[#0A0A0A]">{targetName}</span>?
          </p>

          <div className="flex flex-col items-center gap-2">
            <ReviewStarRating value={rating} onChange={setRating} size={36} />
            <p className="text-sm font-medium text-[#C9A84C] min-h-[20px]">
              {rating === 0 ? "Tap a star to rate" : rating === 1 ? "Poor" : rating === 2 ? "Fair" : rating === 3 ? "Good" : rating === 4 ? "Very Good" : "Excellent"}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-[#0A0A0A]/50 mb-1.5 block">
              Comment (optional)
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share details about your experience..."
              rows={4}
              maxLength={2000}
              className="border-[#E5E5E5] resize-none"
            />
            <p className="text-xs text-[#0A0A0A]/30 mt-1 text-right">{comment.length}/2000</p>
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1 border-[#E5E5E5]" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-[#C9A84C] text-white hover:bg-[#B8983E]"
              disabled={rating === 0 || isSubmitting}
              onClick={handleSubmit}
            >
              {isSubmitting ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
