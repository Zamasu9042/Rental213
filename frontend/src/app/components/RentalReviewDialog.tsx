import React, { useEffect, useState } from 'react';
import { Loader2, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import {
  confirmReview,
  submitItemRating,
  submitUserRating,
} from '../../lib/api';

export interface RentalReviewTarget {
  id: number;
  equipment_id: number;
  equipmentOwnerId: string;
  renter_id: number;
  equipmentName: string;
}

const StarRatingInput: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="flex gap-0.5">
    {[1, 2, 3, 4, 5].map(star => (
      <button key={star} type="button" onClick={() => onChange(star)} className="focus:outline-none rounded p-0.5 hover:bg-gray-50">
        <Star
          className={`w-6 h-6 transition-colors ${
            star <= value ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
          }`}
        />
      </button>
    ))}
  </div>
);

interface RentalReviewDialogProps {
  rental: RentalReviewTarget | null;
  userId: string;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

export const RentalReviewDialog: React.FC<RentalReviewDialogProps> = ({
  rental,
  userId,
  onClose,
  onSuccess,
}) => {
  const [submitting, setSubmitting] = useState(false);
  const [eqStars, setEqStars] = useState(0);
  const [userStars, setUserStars] = useState(0);
  const [eqReviewText, setEqReviewText] = useState('');
  const [userReviewText, setUserReviewText] = useState('');

  const isRenterReview = Boolean(rental && String(rental.renter_id) === userId);

  useEffect(() => {
    if (rental) {
      setEqStars(0);
      setUserStars(0);
      setEqReviewText('');
      setUserReviewText('');
    }
  }, [rental?.id]);

  const handleSubmit = async () => {
    if (!rental) return;
    const ownerId = parseInt(rental.equipmentOwnerId, 10);
    if (Number.isNaN(ownerId)) {
      alert('Could not determine equipment owner.');
      return;
    }
    const raterId = Number(userId);
    const isRenter = String(rental.renter_id) === userId;
    if (isRenter) {
      if (eqStars === 0 || userStars === 0) {
        alert('Please rate the equipment and the owner.');
        return;
      }
    } else if (userStars === 0) {
      alert('Please rate the renter.');
      return;
    }
    setSubmitting(true);
    try {
      if (isRenter) {
        await submitItemRating({
          rater_id: raterId,
          equipment_id: rental.equipment_id,
          owner_id: ownerId,
          rental_id: rental.id,
          score: eqStars,
          review_text: eqReviewText.trim() || null,
        });
        await submitUserRating(ownerId, {
          rater_id: raterId,
          rental_id: rental.id,
          target_type: 'OWNER',
          score: userStars,
          review_text: userReviewText.trim() || null,
        });
      } else {
        await submitUserRating(rental.renter_id, {
          rater_id: raterId,
          rental_id: rental.id,
          target_type: 'RENTER',
          score: userStars,
          review_text: userReviewText.trim() || null,
        });
      }
      await confirmReview(rental.id, raterId);
      onClose();
      await onSuccess();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!rental} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Leave a review</DialogTitle>
          {rental && (
            <p className="text-sm text-gray-500 pt-0.5">
              {rental.equipmentName} · #{rental.id}
            </p>
          )}
        </DialogHeader>
        {rental && (
          <div className="space-y-5 py-1">
            {isRenterReview && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-900">Rate the equipment</Label>
                <StarRatingInput value={eqStars} onChange={setEqStars} />
                <Textarea
                  className="mt-1 text-sm"
                  placeholder="Optional comment on the item"
                  value={eqReviewText}
                  onChange={e => setEqReviewText(e.target.value)}
                  rows={2}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-900">
                {isRenterReview ? 'Rate the owner' : 'Rate the renter'}
              </Label>
              <StarRatingInput value={userStars} onChange={setUserStars} />
              <Textarea
                className="mt-1 text-sm"
                placeholder="Optional comment"
                value={userReviewText}
                onChange={e => setUserReviewText(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
