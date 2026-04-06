/**
 * ConfirmationPage.tsx
 *
 * Stripe redirects here after payment: /confirmation?rental_id=X
 * Fetches the rental from rental-service, then fetches the equipment details.
 * Also used as "My Rentals" view when navigated to without a rental_id.
 */

import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { CheckCircle, Calendar, Package, Clock, Loader2, CreditCard } from 'lucide-react';
import { getRental, getRenterDashboard, getEquipmentById, ApiRental } from '../../lib/api';

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  ACTIVE:     { variant: 'default',      label: 'Active' },
  PENDING:    { variant: 'outline',      label: 'Pending Payment' },
  RETURNED:   { variant: 'secondary',    label: 'Returned' },
  COMPLETED:  { variant: 'secondary',    label: 'Completed' },
  LATE:       { variant: 'destructive',  label: 'Late Return' },
};

interface RentalDisplay extends ApiRental {
  equipmentName?: string;
  equipmentCategory?: string;
  totalPrice?: number;
}

export const ConfirmationPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useApp();

  const rentalIdParam = searchParams.get('rental_id');
  const isMock = searchParams.get('mock') === '1';
  const isPostPayment = !!rentalIdParam;

  const [rentals, setRentals] = useState<RentalDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        if (isPostPayment && rentalIdParam) {
          // Came back from Stripe — load this specific rental
          const rental = await getRental(Number(rentalIdParam));
          let equipmentName = `Equipment #${rental.equipment_id}`;
          let equipmentCategory = '';
          try {
            const eq = await getEquipmentById(rental.equipment_id);
            equipmentName = eq.name;
            equipmentCategory = eq.category;
          } catch { /* non-fatal */ }
          setRentals([{ ...rental, equipmentName, equipmentCategory }]);
        } else if (user) {
          // "My Rentals" view — load all rentals for this user
          const dashboard = await getRenterDashboard(Number(user.id));
          const enriched = await Promise.all(
            dashboard.rentals.map(async (r) => {
              let equipmentName = `Equipment #${r.equipment_id}`;
              let equipmentCategory = '';
              try {
                const eq = await getEquipmentById(r.equipment_id);
                equipmentName = eq.name;
                equipmentCategory = eq.category;
              } catch { /* non-fatal */ }
              return { ...r, equipmentName, equipmentCategory };
            })
          );
          setRentals(enriched);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load rental');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [rentalIdParam, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
        <span className="text-gray-600">Loading your rental...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* Payment success banner */}
        {isPostPayment && (
          <div className="bg-white rounded-lg p-8 mb-8 text-center shadow-sm">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-16 h-16 text-green-500" />
            </div>
            <h1 className="text-3xl mb-2">
              {isMock ? 'Booking Created!' : 'Payment Successful!'}
            </h1>
            <p className="text-gray-600">
              {isMock
                ? 'Your rental has been created (mock mode — Stripe not configured).'
                : 'Your rental has been confirmed. A confirmation SMS will be sent shortly.'}
            </p>
          </div>
        )}

        <div className="mb-6">
          <h2 className="text-2xl">{isPostPayment ? 'Your Rental' : 'My Rentals'}</h2>
          {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
        </div>

        {rentals.length === 0 && !error ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No rentals yet</p>
              <Button onClick={() => navigate('/marketplace')}>Browse Marketplace</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {rentals.map((rental) => {
              const badge = STATUS_BADGE[rental.status] ?? STATUS_BADGE.ACTIVE;
              return (
                <Card key={rental.id}>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-xl font-semibold mb-1">
                            {rental.equipmentName}
                          </h3>
                          {rental.equipmentCategory && (
                            <p className="text-sm text-gray-500">{rental.equipmentCategory}</p>
                          )}
                          <p className="text-sm text-gray-500">Rental #{rental.id}</p>
                        </div>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="w-4 h-4" />
                          <span className="text-sm">
                            {new Date(rental.start_time).toLocaleDateString()} –{' '}
                            {new Date(rental.end_time).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-600">Rate: </span>
                          <span className="font-semibold">${Number(rental.hourly_rate).toFixed(2)}/hr</span>
                        </div>
                      </div>

                      <p className="text-sm text-gray-500">
                        Pickup: {rental.pickup_location}
                      </p>

                      {rental.status === 'LATE' && (
                        <div className="flex items-center gap-2 text-red-600 text-sm">
                          <Clock className="w-4 h-4" />
                          Late return — additional fees may apply
                        </div>
                      )}

                      {(rental.status === 'PENDING' || rental.status === 'LATE') && (
                        <div className="pt-2 border-t">
                          <Button
                            className="gap-2"
                            onClick={() => navigate(`/equipment/${rental.equipment_id}`)}
                          >
                            <CreditCard className="w-4 h-4" />
                            {rental.status === 'PENDING' ? 'Complete Payment' : 'Pay Late Fee'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex gap-4 mt-8 justify-center">
          <Button variant="outline" onClick={() => navigate('/')}>Back to Home</Button>
          <Button onClick={() => navigate('/marketplace')}>Browse More Equipment</Button>
        </div>
      </div>
    </div>
  );
};
