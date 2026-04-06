import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { differenceInDays } from 'date-fns';
import { ChevronLeft, MapPin, Shield, Loader2, Star, AlertTriangle } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  getEquipmentById,
  getEquipmentItemReputation,
  getRenterDashboard,
  getRentalsForEquipment,
  ItemReputationSummary,
} from '../../lib/api';
import { Equipment, useApp } from '../context/AppContext';
import { RentalReviewDialog, RentalReviewTarget } from '../components/RentalReviewDialog';

export const EquipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useApp();

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [pickupLocation, setPickupLocation] = useState('');

  const [reputation, setReputation] = useState<ItemReputationSummary | null>(null);
  const [repLoading, setRepLoading] = useState(false);
  const [pendingReview, setPendingReview] = useState<RentalReviewTarget | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewTick, setReviewTick] = useState(0);
  const [hasOutstandingPayments, setHasOutstandingPayments] = useState(false);

  const refreshReputation = useCallback(() => {
    if (!id) return;
    setRepLoading(true);
    getEquipmentItemReputation(Number(id))
      .then(setReputation)
      .catch(() => setReputation(null))
      .finally(() => setRepLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEquipmentById(id)
      .then(eq => {
        setEquipment(eq);
        setPickupLocation(eq.pickup_location || '');
      })
      .catch(err => setError(err.message || 'Equipment not found'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    refreshReputation();
  }, [refreshReputation, reviewTick]);

  // Check if renter has outstanding payments (blocks new rentals)
  useEffect(() => {
    if (!user || user.role !== 'renter') return;
    getRenterDashboard(Number(user.id))
      .then(d => setHasOutstandingPayments(!d.should_show_equipment_browse))
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!id || !user || !equipment) {
      setPendingReview(null);
      setShowReviewDialog(false);
      return;
    }
    const eqId = Number(id);
    (async () => {
      try {
        if (equipment.ownerId === user.id) {
          const list = await getRentalsForEquipment(eqId);
          const r = list.find(x => x.status === 'RETURNED' && !x.owner_reviewed);
          if (r) {
            setPendingReview({
              id: r.id,
              equipment_id: r.equipment_id,
              equipmentOwnerId: equipment.ownerId,
              renter_id: r.renter_id,
              equipmentName: equipment.name,
            });
          } else setPendingReview(null);
        } else {
          const dash = await getRenterDashboard(Number(user.id));
          const r = dash.rentals.find(
            x => x.equipment_id === eqId && x.status === 'RETURNED' && !x.renter_reviewed
          );
          if (r) {
            setPendingReview({
              id: r.id,
              equipment_id: r.equipment_id,
              equipmentOwnerId: equipment.ownerId,
              renter_id: r.renter_id,
              equipmentName: equipment.name,
            });
          } else setPendingReview(null);
        }
      } catch {
        setPendingReview(null);
      }
    })();
  }, [id, user, equipment, reviewTick]);

  const today = new Date().toISOString().split('T')[0];

  const calculateTotal = () => {
    if (!startDate || !endDate || !equipment) return 0;
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? +(days * equipment.price * 24).toFixed(2) : 0;
  };

  const handlePayment = () => {
    if (!startDate || !endDate) { alert('Please select rental dates'); return; }
    navigate('/payment', {
      state: {
        equipment,
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate).toISOString(),
        totalPrice: calculateTotal(),
        pickupLocation,
      },
    });
  };

  const handleReviewSuccess = async () => {
    setShowReviewDialog(false);
    setReviewTick(t => t + 1);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
        <span className="text-gray-600">Loading equipment...</span>
      </div>
    );
  }

  if (error || !equipment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">{error || 'Equipment not found'}</h2>
          <Button onClick={() => navigate('/marketplace')}>Back to Marketplace</Button>
        </div>
      </div>
    );
  }

  const totalPrice = calculateTotal();
  const rentalDays = startDate && endDate ? differenceInDays(new Date(endDate), new Date(startDate)) + 1 : 0;

  const placeholderImg = `https://placehold.co/600x400?text=${encodeURIComponent(equipment.name)}`;
  const displayImages = equipment.images.length > 0 ? equipment.images : [placeholderImg];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <Button variant="ghost" onClick={() => navigate('/marketplace')} className="mb-4 gap-2 -ml-2 text-sm">
          <ChevronLeft className="w-4 h-4" />
          Marketplace
        </Button>

        {user && pendingReview && (
          <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <p className="text-sm text-violet-950">
              You have a <span className="font-semibold">review pending</span> for this listing (rental #{pendingReview.id}).
            </p>
            <Button size="sm" className="shrink-0" onClick={() => setShowReviewDialog(true)}>
              Open review
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          <div>
            <div className="aspect-square rounded-lg overflow-hidden mb-3 bg-gray-100">
              <img
                src={displayImages[selectedImage]}
                alt={equipment.name}
                className="w-full h-full object-cover"
              />
            </div>
            {displayImages.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {displayImages.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedImage(idx)}
                    className={`aspect-square rounded-md overflow-hidden border-2 ${
                      selectedImage === idx ? 'border-blue-600' : 'border-transparent'
                    }`}
                  >
                    <img src={img} alt={`${equipment.name} ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="bg-white rounded-lg p-5 sm:p-6 shadow-sm border border-gray-100">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-1">{equipment.name}</h1>
                  <p className="text-gray-600 text-sm">{equipment.category}</p>
                </div>
                <Badge variant={equipment.available ? 'default' : 'secondary'} className="shrink-0">
                  {equipment.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>

              <div className="text-2xl text-blue-600 font-semibold mb-4">
                ${equipment.price.toFixed(2)}
                <span className="text-base font-normal text-gray-600">/hr</span>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold text-sm mb-1">Description</h3>
                <p className="text-gray-700 text-sm leading-relaxed">{equipment.description}</p>
              </div>

              {/* Reviews from reputation-service (Kong → /api/reputation/item/:id) */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  Reviews
                </h3>
                {repLoading ? (
                  <p className="text-xs text-gray-500">Loading reviews…</p>
                ) : reputation && reputation.total_entries > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-800">
                      <span className="font-semibold tabular-nums">{reputation.average_score?.toFixed(1)}</span>
                      <span className="text-gray-500"> / 5 · {reputation.total_entries} rating{reputation.total_entries !== 1 ? 's' : ''}</span>
                    </p>
                    <ul className="space-y-2 max-h-40 overflow-y-auto text-xs text-gray-600">
                      {reputation.entries.slice(0, 8).map(entry => (
                        <li key={entry.id} className="border-l-2 border-amber-200 pl-2">
                          <span className="font-medium text-gray-800">{entry.score.toFixed(1)}★</span>
                          {entry.review_text && <span className="ml-1">{entry.review_text}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No reviews yet.</p>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 shrink-0" />
                  <span>Pickup: {pickupLocation || 'See below'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span>Damage protection included</span>
                </div>
              </div>

              <div className="mb-4">
                <Label htmlFor="pickupLocation" className="font-semibold text-sm mb-1.5 block">
                  Confirm pickup location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="pickupLocation"
                    placeholder="e.g. SMU SOE Level 3…"
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    className="pl-10 text-sm"
                  />
                </div>
              </div>

              {/* Outstanding payment block */}
              {hasOutstandingPayments && equipment.available ? (
                <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">Outstanding payment required</p>
                      <p className="text-xs text-amber-800 mt-0.5">
                        You have a pending or late payment. Please settle it before renting new equipment.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => navigate('/my-rentals?filter=payment-due')}
                  >
                    View Payment Due
                  </Button>
                </div>
              ) : equipment.available ? (
                <div className="mb-2">
                  <h3 className="font-semibold text-sm mb-3">Rental period</h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <Label htmlFor="startDate" className="text-xs text-gray-600 mb-1 block">Start</Label>
                      <Input
                        id="startDate"
                        type="date"
                        min={today}
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (endDate && e.target.value > endDate) setEndDate('');
                        }}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <Label htmlFor="endDate" className="text-xs text-gray-600 mb-1 block">End</Label>
                      <Input
                        id="endDate"
                        type="date"
                        min={startDate || today}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        disabled={!startDate}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  {startDate && endDate && rentalDays > 0 && (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                          <div>
                            <p className="text-xs text-gray-600">
                              {rentalDays} {rentalDays === 1 ? 'day' : 'days'} × ${equipment.price.toFixed(2)}/hr × 24h
                            </p>
                            <p className="text-xl font-semibold text-blue-600">${totalPrice.toFixed(2)}</p>
                          </div>
                          <Button className="w-full sm:w-auto shrink-0" onClick={handlePayment}>
                            Proceed to payment
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-3 text-center text-sm text-gray-500">
                  This equipment is unavailable.
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-gray-100">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => navigate(hasOutstandingPayments ? '/my-rentals?filter=payment-due' : '/my-rentals')}
                >
                  {hasOutstandingPayments ? 'Pay outstanding fees' : 'Manage rentals (pickup, return, reviews)'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {user && (
        <RentalReviewDialog
          rental={showReviewDialog && pendingReview ? pendingReview : null}
          userId={user.id}
          onClose={() => setShowReviewDialog(false)}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  );
};
