import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ChevronLeft, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

export const ListingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { myListings, rentals, markLateReturn } = useApp();
  const listing = myListings.find(l => l.id === id);

  const [lateFeeAmount, setLateFeeAmount] = useState('');
  const [lateRentalId, setLateRentalId] = useState<string | null>(null);

  if (!listing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Listing not found</h2>
          <Button onClick={() => navigate('/my-listings')}>
            Back to My Listings
          </Button>
        </div>
      </div>
    );
  }

  // Rentals for this listing from AppContext
  const listingRentals = rentals.filter(r => r.equipmentId === listing.id);
  const pendingReturns = listingRentals.filter(r => r.status === 'pending-return');
  const activeRentals = listingRentals.filter(r => r.status === 'active');
  const completedRentals = listingRentals.filter(r =>
    r.status === 'completed' || r.status === 'late'
  );

  const handleConfirmReturn = (rentalId: string) => {
    navigate(`/review/${rentalId}`);
  };

  const handleMarkLate = (rentalId: string) => {
    setLateRentalId(rentalId);
  };

  const handleSubmitLateFee = () => {
    if (!lateRentalId) return;
    const fee = parseFloat(lateFeeAmount);
    if (isNaN(fee) || fee <= 0) {
      alert('Please enter a valid fee amount');
      return;
    }
    markLateReturn(lateRentalId, fee);
    setLateRentalId(null);
    setLateFeeAmount('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/my-listings')}
          className="mb-6 gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to My Listings
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Equipment Details */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <img
                    src={listing.images[0]}
                    alt={listing.name}
                    className="w-full md:w-64 h-64 object-cover rounded-lg"
                  />
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h1 className="text-2xl font-semibold mb-2">{listing.name}</h1>
                        <p className="text-gray-600">{listing.category}</p>
                      </div>
                      <Badge variant={listing.available ? 'default' : 'secondary'}>
                        {listing.available ? 'Available' : 'Rented'}
                      </Badge>
                    </div>
                    <p className="text-gray-700 mb-4">{listing.description}</p>
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Daily Rate</p>
                        <p className="text-2xl font-bold text-blue-600">${listing.price}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Condition</p>
                        <p className="font-semibold">{listing.condition}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Pending Returns — requires owner action */}
            {pendingReturns.length > 0 && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <h3 className="font-semibold text-amber-900">Pending Return Confirmation</h3>
                  </div>
                  <div className="space-y-4">
                    {pendingReturns.map((rental) => (
                      <div key={rental.id} className="bg-white rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">Rental #{rental.id.slice(-6)}</p>
                            <p className="text-sm text-gray-600">
                              {new Date(rental.startDate).toLocaleDateString()} –{' '}
                              {new Date(rental.endDate).toLocaleDateString()}
                            </p>
                            {rental.pickupLocation && (
                              <p className="text-xs text-gray-500">Pickup: {rental.pickupLocation}</p>
                            )}
                          </div>
                          <span className="font-semibold text-green-600">${rental.totalPrice}</span>
                        </div>

                        {lateRentalId === rental.id ? (
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <Label htmlFor="lateFee" className="text-sm">Late Fee Amount ($)</Label>
                              <Input
                                id="lateFee"
                                type="number"
                                min="0"
                                placeholder="e.g. 50"
                                value={lateFeeAmount}
                                onChange={e => setLateFeeAmount(e.target.value)}
                              />
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={handleSubmitLateFee}
                            >
                              Confirm Late Fee
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setLateRentalId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="gap-2 flex-1"
                              onClick={() => handleConfirmReturn(rental.id)}
                            >
                              <CheckCircle className="w-4 h-4" />
                              Confirm Return (Good Condition)
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleMarkLate(rental.id)}
                            >
                              Mark as Late Return
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Active Rentals */}
            {activeRentals.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">Currently Rented</h3>
                  <div className="space-y-3">
                    {activeRentals.map((rental) => (
                      <div key={rental.id} className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                        <div>
                          <p className="font-semibold">Rental #{rental.id.slice(-6)}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(rental.startDate).toLocaleDateString()} –{' '}
                            {new Date(rental.endDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">${rental.totalPrice}</p>
                          <Badge variant="default">Active</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Completed Rental History */}
            {completedRentals.length > 0 && (
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">Rental History</h3>
                  <div className="space-y-4">
                    {completedRentals.map((rental) => (
                      <div key={rental.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-semibold">Rental #{rental.id.slice(-6)}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(rental.startDate).toLocaleDateString()} –{' '}
                            {new Date(rental.endDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-green-600">${rental.totalPrice}</p>
                          <Badge variant={rental.status === 'late' ? 'destructive' : 'secondary'}>
                            {rental.status === 'late' ? 'Late Return' : 'Completed'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {listingRentals.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-gray-500">
                  No rentals yet for this listing.
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full">
                    Edit Listing
                  </Button>
                  <Button variant="outline" className="w-full">
                    Update Photos
                  </Button>
                  <Button variant="outline" className="w-full">
                    Change Availability
                  </Button>
                  <Button variant="outline" className="w-full text-red-600 hover:text-red-700">
                    Delete Listing
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Damage Report */}
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <h3 className="font-semibold">Report Damage</h3>
                </div>
                <p className="text-sm text-gray-700 mb-4">
                  If your equipment was returned damaged, you can file a damage claim.
                </p>
                <Button
                  variant="outline"
                  className="w-full border-orange-300 hover:bg-orange-100"
                  onClick={() => {
                    const lastRenter = completedRentals[completedRentals.length - 1] ??
                      pendingReturns[0] ?? activeRentals[0];
                    navigate(`/damage-claim/${listing.id}`, {
                      state: {
                        equipmentName: listing.name,
                        lastRenter: { renterName: lastRenter ? `Renter #${lastRenter.id.slice(-6)}` : 'Unknown' },
                      },
                    });
                  }}
                >
                  File Damage Claim
                </Button>
              </CardContent>
            </Card>

            {/* Stats */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-4">Performance</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Rentals</span>
                    <span className="font-semibold">{listingRentals.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Earned</span>
                    <span className="font-semibold text-green-600">
                      ${completedRentals.reduce((sum, r) => sum + r.totalPrice, 0)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};
