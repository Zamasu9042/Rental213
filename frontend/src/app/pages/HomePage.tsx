import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Equipment } from '../context/AppContext';
import {
  getEquipment,
  getAllEquipment,
  getRenterDashboard,
  getEquipmentById,
  getRentalsForEquipment,
  getAccount,
  ApiRental,
} from '../../lib/api';
import { EquipmentCard } from '../components/EquipmentCard';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { ArrowRight, Loader2, Calendar, MapPin, Clock, CreditCard } from 'lucide-react';
import { RENTAL_STATUS_BADGE } from '../../lib/rentalStatusBadges';

const STATUS_BADGE = RENTAL_STATUS_BADGE;

type HomeRentTab = 'renting' | 'rented-out';

interface HomeRentalRow extends ApiRental {
  equipmentName: string;
  contactLabel: 'Owner' | 'Renter';
  contactName?: string;
  contactPhone?: string;
}

export const HomePage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();

  const [featured, setFeatured] = useState<Equipment[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);

  const [homeRentTab, setHomeRentTab] = useState<HomeRentTab>('renting');
  const [rentingList, setRentingList] = useState<HomeRentalRow[]>([]);
  const [rentedOutList, setRentedOutList] = useState<HomeRentalRow[]>([]);
  const [rentalsLoading, setRentalsLoading] = useState(false);

  useEffect(() => {
    getEquipment()
      .then(items => {
        setFeatured(items.slice(0, 4));
        const cats = [...new Set(items.map(e => e.category))].sort();
        setCategories(cats);
      })
      .catch(() => {})
      .finally(() => setFeaturedLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    setRentalsLoading(true);
    (async () => {
      try {
        const dash = await getRenterDashboard(Number(user.id));
        const rentingEnriched: HomeRentalRow[] = await Promise.all(
          dash.rentals.map(async r => {
            let equipmentName = `Equipment #${r.equipment_id}`;
            let ownerId: number | null = null;
            try {
              const eq = await getEquipmentById(r.equipment_id);
              equipmentName = eq.name;
              ownerId = parseInt(eq.ownerId, 10);
            } catch { /* ignore */ }
            let contactName: string | undefined;
            let contactPhone: string | undefined;
            if (ownerId != null && !Number.isNaN(ownerId)) {
              try {
                const a = await getAccount(ownerId);
                contactName = a.accountName;
                contactPhone = a.phoneNo;
              } catch { /* ignore */ }
            }
            return {
              ...r,
              equipmentName,
              contactLabel: 'Owner' as const,
              contactName,
              contactPhone,
            };
          })
        );

        const allEq = await getAllEquipment();
        const owned = allEq.filter(e => e.ownerId === user.id);
        const rentedOut: HomeRentalRow[] = [];
        await Promise.all(
          owned.map(async eq => {
            try {
              const list = await getRentalsForEquipment(eq.id);
              for (const r of list) {
                let contactName: string | undefined;
                let contactPhone: string | undefined;
                try {
                  const a = await getAccount(r.renter_id);
                  contactName = a.accountName;
                  contactPhone = a.phoneNo;
                } catch { /* ignore */ }
                rentedOut.push({
                  ...r,
                  equipmentName: eq.name,
                  contactLabel: 'Renter',
                  contactName,
                  contactPhone,
                });
              }
            } catch { /* ignore */ }
          })
        );
        rentedOut.sort((a, b) => b.id - a.id);

        setRentingList(rentingEnriched);
        setRentedOutList(rentedOut);
      } catch {
        setRentingList([]);
        setRentedOutList([]);
      } finally {
        setRentalsLoading(false);
      }
    })();
  }, [user?.id]);

  const displayRentals = homeRentTab === 'renting' ? rentingList : rentedOutList;

  const hasBlockingRental = rentingList.some(r => r.status === 'PENDING' || r.status === 'LATE');

  const handleEquipmentClick = (equipment: Equipment) => {
    if (!user) { navigate(`/equipment/${equipment.id}`); return; }
    // Unpaid/late: show Marketplace “payment not paid” screen first, not My Rentals
    if (rentalsLoading || hasBlockingRental) {
      navigate('/marketplace');
    } else {
      navigate(`/equipment/${equipment.id}`);
    }
  };

  const activeRentals = displayRentals.filter(r =>
    ['ACTIVE', 'PENDING', 'LATE', 'COLLECTED'].includes(r.status)
  );
  const pastRentals = displayRentals.filter(r =>
    ['RETURNED', 'COMPLETED'].includes(r.status)
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl mb-4">
            Welcome back, {user?.name ?? 'there'}!
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl">
            Discover equipment rentals near you. From power tools to cameras, find everything you need.
          </p>
        </div>
      </section>

      {user && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-2xl">My Rentals</h2>
              <div className="flex items-center gap-2 flex-wrap justify-between sm:justify-end">
                <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setHomeRentTab('renting')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      homeRentTab === 'renting' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Renting
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeRentTab('rented-out')}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      homeRentTab === 'rented-out' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Rented out
                  </button>
                </div>
                <Button
                  variant="ghost"
                  className="gap-2"
                  onClick={() =>
                    navigate(
                      hasBlockingRental ? '/my-rentals?filter=payment-due' : '/my-rentals'
                    )
                  }
                >
                  View All <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {rentalsLoading ? (
            <div className="flex items-center gap-2 py-6 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Loading your rentals...</span>
            </div>
          ) : activeRentals.length === 0 && pastRentals.length === 0 ? (
            <p className="text-gray-500 py-4">
              {homeRentTab === 'renting'
                ? 'No rentals yet. Browse the marketplace to get started.'
                : 'Nothing rented out yet. Add listings from My Listings.'}
            </p>
          ) : (
            <div className="space-y-3">
              {activeRentals.map(rental => {
                const badge = STATUS_BADGE[rental.status] ?? STATUS_BADGE.ACTIVE;
                const isPending = rental.status === 'PENDING';
                const isLate = rental.status === 'LATE';
                return (
                  <Card key={rental.id} className={`border-l-4 ${isPending ? 'border-l-yellow-400' : isLate ? 'border-l-red-500' : 'border-l-blue-500'}`}>
                    <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold truncate">
                            {rental.equipmentName}
                          </span>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                        {(rental.contactName || rental.contactPhone) && (
                          <p className="text-xs text-gray-600 mb-1">
                            <span className="font-medium">{rental.contactLabel}:</span>{' '}
                            {[rental.contactName, rental.contactPhone].filter(Boolean).join(' · ')}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(rental.start_time).toLocaleDateString()} – {new Date(rental.end_time).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {rental.pickup_location}
                          </span>
                        </div>
                        {isLate && rental.return_timestamp && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Returned {new Date(rental.return_timestamp).toLocaleDateString()} — late fees apply
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {(isPending || isLate) && homeRentTab === 'renting' && (
                          <Button
                            size="sm"
                            className="gap-1"
                            onClick={() => navigate('/my-rentals?filter=payment-due')}
                          >
                            <CreditCard className="w-3 h-3" />
                            Pay Now
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate(
                              isPending || isLate
                                ? '/my-rentals?filter=payment-due'
                                : '/my-rentals'
                            )
                          }
                        >
                          Details
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {pastRentals.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {pastRentals.slice(0, 2).map(rental => {
                    const badge = STATUS_BADGE[rental.status] ?? STATUS_BADGE.COMPLETED;
                    return (
                      <Card key={rental.id} className="opacity-75">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm truncate">
                              {rental.equipmentName}
                            </span>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                          {(rental.contactName || rental.contactPhone) && (
                            <p className="text-xs text-gray-500 mt-1">
                              {rental.contactLabel}: {[rental.contactName, rental.contactPhone].filter(Boolean).join(' · ')}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(rental.start_time).toLocaleDateString()} – {new Date(rental.end_time).toLocaleDateString()}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {categories.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-10">
          <h2 className="text-2xl mb-6">Browse by Category</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map(category => (
              <Button
                key={category}
                variant="outline"
                className="h-24 text-base hover:bg-blue-50 hover:border-blue-300"
                onClick={() => navigate(`/marketplace?category=${encodeURIComponent(category)}`)}
              >
                {category}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section className="max-w-7xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl">Featured Equipment</h2>
          <Button variant="ghost" className="gap-2" onClick={() => navigate('/marketplace')}>
            View All <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {featuredLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
            <span className="text-gray-500">Loading equipment...</span>
          </div>
        ) : featured.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map(equipment => (
              <EquipmentCard
                key={equipment.id}
                equipment={equipment}
                onClick={() => handleEquipmentClick(equipment)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p>No equipment available yet.</p>
            <Button className="mt-4" onClick={() => navigate('/marketplace')}>Browse Marketplace</Button>
          </div>
        )}
      </section>

      <section className="max-w-7xl mx-auto px-4 py-10">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-8 md:p-12 text-white text-center">
          <h2 className="text-3xl mb-4">Have equipment to rent out?</h2>
          <p className="text-lg text-indigo-100 mb-6 max-w-2xl mx-auto">
            Turn your idle equipment into income. List your items and start earning today.
          </p>
          <Button size="lg" variant="secondary" onClick={() => navigate('/my-listings')}>
            View My Listings
          </Button>
        </div>
      </section>
    </div>
  );
};
