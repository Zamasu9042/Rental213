import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Package, Loader2, AlertTriangle, Calendar, MapPin, AlertCircle } from 'lucide-react';
import { getEquipment, getRentalsForEquipment, ApiRental } from '../../lib/api';
import { Equipment } from '../context/AppContext';

interface RentalRow {
  rental: ApiRental;
  equipment: Equipment;
}

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  ACTIVE:    { variant: 'default',     label: 'Active' },
  PENDING:   { variant: 'outline',     label: 'Pending Payment' },
  RETURNED:  { variant: 'secondary',   label: 'Returned' },
  COMPLETED: { variant: 'secondary',   label: 'Completed' },
  LATE:      { variant: 'destructive', label: 'Late Return' },
};

// Statuses that allow a damage claim to be filed
const CLAIMABLE = new Set(['RETURNED', 'COMPLETED', 'LATE']);

export const MyListingsPage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [allRentals, setAllRentals] = useState<RentalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    getEquipment()
      .then(async all => {
        const owned = all.filter(e => e.ownerId === user.id);
        setEquipment(owned);

        // Fetch all rentals for each owned equipment
        const rows: RentalRow[] = [];
        await Promise.all(
          owned.map(async eq => {
            try {
              const rentals = await getRentalsForEquipment(eq.id);
              rentals.forEach(r => rows.push({ rental: r, equipment: eq }));
            } catch {
              // ignore per-equipment errors
            }
          })
        );
        // Sort all rentals newest first
        rows.sort((a, b) => b.rental.id - a.rental.id);
        setAllRentals(rows);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
        <span className="text-gray-500">Loading your listings...</span>
      </div>
    );
  }

  const activeRentals  = allRentals.filter(r => r.rental.status === 'ACTIVE');
  const claimableRentals = allRentals.filter(r => CLAIMABLE.has(r.rental.status));
  const pendingRentals = allRentals.filter(r => r.rental.status === 'PENDING');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl mb-1">My Listings</h1>
          <p className="text-gray-500 text-sm">
            {equipment.length} equipment listed · {allRentals.length} total rentals
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Equipment Overview */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">Your Equipment</h2>
          {equipment.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                <Package className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                No equipment listed under your account.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {equipment.map(eq => (
                <Card key={eq.id} className="flex gap-4 p-4 items-center">
                  {eq.images[0] ? (
                    <img
                      src={eq.images[0]}
                      alt={eq.name}
                      className="w-16 h-16 object-cover rounded-lg shrink-0"
                      onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/64x64?text=No+img'; }}
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                      <Package className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{eq.name}</p>
                    <p className="text-xs text-gray-500">{eq.category} · ${eq.price}/hr</p>
                    <Badge
                      variant={eq.available ? 'default' : 'secondary'}
                      className="mt-1 text-xs"
                    >
                      {eq.available ? 'Available' : 'Rented Out'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Active Rentals */}
        {activeRentals.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-3">Currently Rented Out</h2>
            <div className="space-y-3">
              {activeRentals.map(({ rental, equipment: eq }) => (
                <RentalCard key={rental.id} rental={rental} equipmentName={eq.name} />
              ))}
            </div>
          </section>
        )}

        {/* Pending Payment */}
        {pendingRentals.length > 0 && (
          <section className="mb-10">
            <h2 className="text-lg font-semibold mb-3">Pending Payment</h2>
            <div className="space-y-3">
              {pendingRentals.map(({ rental, equipment: eq }) => (
                <RentalCard key={rental.id} rental={rental} equipmentName={eq.name} />
              ))}
            </div>
          </section>
        )}

        {/* Returned Rentals — Damage Claim Eligible */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold">Returned Rentals</h2>
            <span className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-0.5">
              Damage claims can be filed here
            </span>
          </div>

          {claimableRentals.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                No returned rentals yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {claimableRentals.map(({ rental, equipment: eq }) => (
                <Card key={rental.id} className="border-l-4 border-l-gray-300">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold">{eq.name}</span>
                        <Badge variant={STATUS_BADGE[rental.status]?.variant ?? 'outline'}>
                          {STATUS_BADGE[rental.status]?.label ?? rental.status}
                        </Badge>
                        {rental.status === 'LATE' && (
                          <Badge variant="destructive" className="text-xs">Late Fee Applies</Badge>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mb-1">
                        Rental #{rental.id} · Renter #{rental.renter_id}
                      </p>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(rental.start_time).toLocaleDateString()} –{' '}
                          {new Date(rental.end_time).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {rental.pickup_location}
                        </span>
                      </div>
                      {rental.return_timestamp && (
                        <p className="text-xs text-gray-400 mt-1">
                          Returned: {new Date(rental.return_timestamp).toLocaleString()}
                        </p>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="destructive"
                      className="shrink-0 gap-1"
                      onClick={() =>
                        navigate(`/damage-claim/${rental.id}`, {
                          state: {
                            equipmentName: eq.name,
                            renterName: `Renter #${rental.renter_id}`,
                          },
                        })
                      }
                    >
                      <AlertCircle className="w-3 h-3" />
                      File Damage Claim
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

// ── Small helper component ─────────────────────────────────────────────────────
const RentalCard: React.FC<{ rental: ApiRental; equipmentName: string }> = ({ rental, equipmentName }) => {
  const badge = STATUS_BADGE[rental.status] ?? { variant: 'outline' as const, label: rental.status };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold">{equipmentName}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="text-xs text-gray-500 mb-1">
          Rental #{rental.id} · Renter #{rental.renter_id}
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(rental.start_time).toLocaleDateString()} –{' '}
            {new Date(rental.end_time).toLocaleDateString()}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {rental.pickup_location}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};
