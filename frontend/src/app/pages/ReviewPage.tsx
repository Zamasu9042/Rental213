import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { ChevronLeft, Star } from 'lucide-react';

const StarRating: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <button
        key={star}
        type="button"
        onClick={() => onChange(star)}
        className="focus:outline-none"
      >
        <Star
          className={`w-8 h-8 transition-colors ${
            star <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'
          }`}
        />
      </button>
    ))}
  </div>
);

export const ReviewPage: React.FC = () => {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const { rentals, confirmReturn, addReview } = useApp();

  const rental = rentals.find(r => r.id === rentalId);

  const [equipmentRating, setEquipmentRating] = useState(0);
  const [equipmentComment, setEquipmentComment] = useState('');
  const [renterRating, setRenterRating] = useState(0);
  const [renterComment, setRenterComment] = useState('');

  if (!rental) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Rental not found</h2>
          <Button onClick={() => navigate('/my-listings')}>Back to My Listings</Button>
        </div>
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (equipmentRating === 0 || renterRating === 0) {
      alert('Please provide ratings for both the equipment and the renter.');
      return;
    }

    const now = new Date().toISOString();

    addReview({
      id: `review-eq-${Date.now()}`,
      rentalId: rental.id,
      rating: equipmentRating,
      comment: equipmentComment,
      targetType: 'equipment',
      targetId: rental.equipmentId,
      date: now,
    });

    addReview({
      id: `review-user-${Date.now()}`,
      rentalId: rental.id,
      rating: renterRating,
      comment: renterComment,
      targetType: 'user',
      targetId: 'renter-id',
      date: now,
    });

    confirmReturn(rental.id);
    navigate('/my-listings');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="bg-white rounded-lg p-6 mb-6 shadow-sm">
          <h1 className="text-2xl mb-1">Leave a Review</h1>
          <p className="text-gray-600 text-sm">
            Rental: <span className="font-semibold">{rental.equipment.name}</span>
          </p>
          <p className="text-gray-500 text-xs mt-1">
            {new Date(rental.startDate).toLocaleDateString()} – {new Date(rental.endDate).toLocaleDateString()}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Equipment Review */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rate the Equipment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <img
                  src={rental.equipment.images[0]}
                  alt={rental.equipment.name}
                  className="w-16 h-16 object-cover rounded"
                />
                <p className="font-semibold">{rental.equipment.name}</p>
              </div>
              <div>
                <Label className="mb-2 block">Rating</Label>
                <StarRating value={equipmentRating} onChange={setEquipmentRating} />
              </div>
              <div>
                <Label htmlFor="equipComment" className="mb-2 block">Comment (optional)</Label>
                <Textarea
                  id="equipComment"
                  placeholder="How was the condition of the equipment?"
                  value={equipmentComment}
                  onChange={(e) => setEquipmentComment(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Renter Review */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rate the Renter</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="mb-2 block">Rating</Label>
                <StarRating value={renterRating} onChange={setRenterRating} />
              </div>
              <div>
                <Label htmlFor="renterComment" className="mb-2 block">Comment (optional)</Label>
                <Textarea
                  id="renterComment"
                  placeholder="How was the renter? Did they return the item on time and in good condition?"
                  value={renterComment}
                  onChange={(e) => setRenterComment(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <Button type="submit" className="flex-1" size="lg">
              Submit Reviews & Confirm Return
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
