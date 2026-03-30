import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { CheckCircle, Calendar, Package, RotateCcw, Clock } from 'lucide-react';
import { Rental } from '../context/AppContext';

interface LocationState {
  rental?: Rental;
}

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  active: { variant: 'default', label: 'Active' },
  'pending-return': { variant: 'outline', label: 'Pending Confirmation' },
  completed: { variant: 'secondary', label: 'Completed' },
  overdue: { variant: 'destructive', label: 'Overdue' },
  late: { variant: 'destructive', label: 'Late Return' },
};

export const ConfirmationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { rentals, returnRental } = useApp();
  const state = location.state as LocationState;

  const displayRentals = state?.rental ? [state.rental] : rentals;
  const isConfirmation = !!state?.rental;

  const handleReturn = (rental: Rental) => {
    returnRental(rental.id);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {isConfirmation && (
          <div className="bg-white rounded-lg p-8 mb-8 text-center shadow-sm">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h1 className="text-3xl mb-2">Payment Successful!</h1>
            <p className="text-gray-600">
              Your rental has been confirmed. Details have been sent to your email.
            </p>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-2xl">
            {isConfirmation ? 'Your Rental' : 'My Rentals'}
          </h2>
          <p className="text-gray-600">
            {displayRentals.length === 0
              ? 'You have no rentals'
              : `${displayRentals.length} ${displayRentals.length === 1 ? 'rental' : 'rentals'}`}
          </p>
        </div>

        {displayRentals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No rentals yet</p>
              <Button onClick={() => navigate('/marketplace')}>
                Browse Marketplace
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {displayRentals.map((rental) => {
              // Use live state from rentals if available
              const liveRental = rentals.find(r => r.id === rental.id) ?? rental;
              const badge = STATUS_BADGE[liveRental.status] ?? STATUS_BADGE.active;
              return (
                <Card key={liveRental.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      <img
                        src={liveRental.equipment.images[0]}
                        alt={liveRental.equipment.name}
                        className="w-full md:w-32 h-32 object-cover rounded"
                      />

                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-xl font-semibold mb-1">
                              {liveRental.equipment.name}
                            </h3>
                            <p className="text-sm text-gray-600">
                              from {liveRental.equipment.ownerName}
                            </p>
                          </div>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mt-2 mb-4">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">
                              {new Date(liveRental.startDate).toLocaleDateString()} -{' '}
                              {new Date(liveRental.endDate).toLocaleDateString()}
                            </span>
                          </div>
                          <div className="text-sm">
                            <span className="text-gray-600">Total Paid: </span>
                            <span className="font-semibold text-green-600">${liveRental.totalPrice}</span>
                          </div>
                        </div>

                        {liveRental.pickupLocation && (
                          <p className="text-sm text-gray-500 mb-4">
                            Pickup: {liveRental.pickupLocation}
                          </p>
                        )}

                        {liveRental.status === 'active' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleReturn(liveRental)}
                          >
                            <RotateCcw className="w-4 h-4" />
                            Return Item
                          </Button>
                        )}

                        {liveRental.status === 'pending-return' && (
                          <div className="flex items-center gap-2 text-amber-600 text-sm">
                            <Clock className="w-4 h-4" />
                            Awaiting owner confirmation
                          </div>
                        )}

                        {liveRental.status === 'late' && (
                          <div className="flex items-center gap-2 text-red-600 text-sm">
                            <Clock className="w-4 h-4" />
                            Late return fee applied — check your account
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {isConfirmation && (
          <div className="flex gap-4 mt-8 justify-center">
            <Button variant="outline" onClick={() => navigate('/')}>
              Back to Home
            </Button>
            <Button onClick={() => navigate('/marketplace')}>
              Continue Shopping
            </Button>
          </div>
        )}

        {!isConfirmation && (
          <div className="mt-6 text-center">
            <Button variant="outline" onClick={() => navigate('/marketplace')}>
              Browse More Equipment
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
