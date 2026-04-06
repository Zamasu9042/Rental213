/**
 * MarketplacePage.tsx
 *
 * Scenario 1 — Step 1 & 2/3:
 *  1. On mount, GET /api/rental/renter/:id/dashboard to check for PENDING/LATE rentals.
 *     If found, block equipment browse and redirect user to their active rental.
 *  2. If clear, GET /api/equipment via Kong to list available items.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApp } from '../context/AppContext';
import { EquipmentCard } from '../components/EquipmentCard';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Search, Loader2, AlertTriangle } from 'lucide-react';
import { getEquipment, getRenterDashboard, ApiRental } from '../../lib/api';
import { Equipment } from '../context/AppContext';

export const MarketplacePage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useApp();

  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(
    searchParams.get('category') || 'all'
  );

  // Step 1: blocking rental (PENDING or LATE)
  const [blockingRental, setBlockingRental] = useState<ApiRental | null>(null);
  const [dashboardChecked, setDashboardChecked] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      // Step 1 — check rental dashboard first (only if user is logged in)
      if (user) {
        try {
          const dashboard = await getRenterDashboard(Number(user.id));
          if (!dashboard.should_show_equipment_browse) {
            // User has a PENDING or LATE rental — find it and block browse
            const blocking = dashboard.rentals.find(
              r => r.status === 'PENDING' || r.status === 'LATE'
            ) ?? null;
            setBlockingRental(blocking);
            setDashboardChecked(true);
            setLoading(false);
            return; // don't load equipment
          }
        } catch {
          // Non-fatal: if dashboard check fails, still show equipment
        }
      }

      setDashboardChecked(true);

      // Step 2/3 — load equipment via Kong → equipment-service
      try {
        const items = await getEquipment();
        setEquipment(items);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load equipment');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user?.id]);

  const categories = useMemo(() => {
    const cats = [...new Set(equipment.map(e => e.category))];
    return cats.sort();
  }, [equipment]);

  const filteredEquipment = useMemo(() => {
    let filtered = equipment;
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(eq => eq.category === selectedCategory);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(eq =>
        eq.name.toLowerCase().includes(query) ||
        eq.description.toLowerCase().includes(query) ||
        eq.category.toLowerCase().includes(query)
      );
    }
    return filtered;
  }, [equipment, searchQuery, selectedCategory]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
        <span className="text-gray-600">
          {dashboardChecked ? 'Loading equipment...' : 'Checking your rental status...'}
        </span>
      </div>
    );
  }

  // Step 1 result: block browse if PENDING or LATE rental exists
  if (blockingRental) {
    const isPending = blockingRental.status === 'PENDING';
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-sm p-8 text-center">
          <AlertTriangle className={`w-16 h-16 mx-auto mb-4 ${isPending ? 'text-yellow-500' : 'text-red-500'}`} />
          <h2 className="text-2xl font-semibold mb-2">
            {isPending ? 'Payment Pending' : 'Late Return Outstanding'}
          </h2>
          <p className="text-gray-600 mb-2">
            {isPending
              ? 'You have an unpaid rental. Please complete payment before renting another item.'
              : 'You have a late return with outstanding fees. Please resolve it before renting again.'}
          </p>
          <p className="text-sm text-gray-400 mb-6">
            Rental #{blockingRental.id} — Status: {blockingRental.status}
          </p>
          <div className="flex flex-col gap-3">
            <Button onClick={() => navigate('/my-rentals')}>
              View My Rentals
            </Button>
            <Button variant="outline" onClick={() => navigate('/')}>
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl mb-8">Marketplace</h1>

        {/* Search and Filter Bar */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <Input
                placeholder="Search for equipment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <p className="text-red-700">{error}</p>
            <p className="text-sm text-red-500 mt-2">Make sure the backend services are running.</p>
            <Button variant="outline" className="mt-4" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        )}

        {/* Results */}
        {!error && (
          <>
            <div className="mb-4">
              <p className="text-gray-600">
                {filteredEquipment.length} {filteredEquipment.length === 1 ? 'item' : 'items'} found
              </p>
            </div>

            {filteredEquipment.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredEquipment.map((eq) => (
                  <EquipmentCard
                    key={eq.id}
                    equipment={eq}
                    onClick={() => navigate(`/equipment/${eq.id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No equipment found matching your criteria.</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}
                >
                  Clear Filters
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
