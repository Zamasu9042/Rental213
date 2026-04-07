/**
 * ConfirmationPage / My Rentals
 *
 * Two top-level tabs:
 *   • Renting     — rentals where I am the renter
 *   • Rented Out  — rentals where I am the owner (equipment owner_id = user.id)
 *
 * Within each tab, filter tabs:
 *   All | Pickup | Return | Review | Completed | Payment Due
 *
 * Flow: ACTIVE → (both confirm pickup) → COLLECTED → (both confirm return) → RETURNED → (both review) → COMPLETED
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  CheckCircle, Calendar, Package, Clock, Loader2,
  CreditCard, Truck, RotateCcw, Star, AlertCircle, MapPin, ShieldAlert,
} from 'lucide-react';
import {
  getRental, getRenterDashboard, getEquipmentById, getRentalsForEquipment,
  getEquipment, getAllEquipment, markCollected, confirmReturn,
  getAccount, getDamageClaimByRental,
  ApiRental, ApiDamageClaim,
} from '../../lib/api';
import { RENTAL_STATUS_BADGE } from '../../lib/rentalStatusBadges';
import { RentalReviewDialog } from '../components/RentalReviewDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RentalDisplay extends ApiRental {
  equipmentName: string;
  equipmentOwnerId: string;
  ownerName?: string;
  ownerPhone?: string;
  renterName?: string;
  renterPhone?: string;
}

type TopTab = 'renting' | 'rented-out';
type FilterTab = 'all' | 'not-collected' | 'not-returned' | 'not-reviewed' | 'completed' | 'payment-due';

const FILTER_EMPTY: Record<Exclude<FilterTab, 'all'>, string> = {
  'not-collected': 'pickup',
  'not-returned':  'return',
  'not-reviewed':  'review',
  'completed':     'completed',
  'payment-due':   'outstanding payment',
};

// ─── Badge config ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  ACTIVE:    { variant: 'default',     label: 'Awaiting pickup' },
  COLLECTED: { variant: 'default',     label: 'Awaiting return' },
  RETURNED:  { variant: 'outline',     label: 'Awaiting review' },
  COMPLETED: RENTAL_STATUS_BADGE.COMPLETED,
  LATE:      RENTAL_STATUS_BADGE.LATE,
  PENDING:   RENTAL_STATUS_BADGE.PENDING,
};

// ─── Filter helpers ───────────────────────────────────────────────────────────

function matchesFilter(r: ApiRental, filter: FilterTab): boolean {
  if (filter === 'all')          return true;
  if (filter === 'not-collected') return r.status === 'ACTIVE';
  if (filter === 'not-returned')  return r.status === 'COLLECTED';
  if (filter === 'not-reviewed')  return r.status === 'RETURNED';
  if (filter === 'completed')     return r.status === 'COMPLETED';
  if (filter === 'payment-due')   return r.status === 'PENDING' || r.status === 'LATE';
  return true;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const ConfirmationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useApp();

  const rentalIdParam = searchParams.get('rental_id');
  const isMock = searchParams.get('mock') === '1';
  const isPostPayment = !!rentalIdParam;

  const [rentingRentals, setRentingRentals]   = useState<RentalDisplay[]>([]);
  const [rentedOutRentals, setRentedOutRentals] = useState<RentalDisplay[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');

  const [topTab, setTopTab]       = useState<TopTab>('renting');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // claim lookup for COMPLETED owner rentals: rentalId → claim or null
  const [claimsByRental, setClaimsByRental] = useState<Record<number, ApiDamageClaim | null>>({});

  // Track which rental IDs are currently being actioned (spinner)
  const [actioning, setActioning] = useState<Set<number>>(new Set());
  const [reviewRental, setReviewRental] = useState<RentalDisplay | null>(null);

  // ── Read URL filter param on mount ─────────────────────────────────────────

  useEffect(() => {
    const fp = searchParams.get('filter');
    if (fp === 'payment-due') { setFilterTab('payment-due'); setTopTab('renting'); }
    else if (fp === 'completed') setFilterTab('completed');
    else if (fp === 'pickup')   setFilterTab('not-collected');
    else if (fp === 'return')   setFilterTab('not-returned');
    else if (fp === 'review')   setFilterTab('not-reviewed');
  }, []); // only on mount

  // ── Data loading ────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      // ── Renting tab: rentals where I am the renter ──
      const dashboard = await getRenterDashboard(Number(user.id));
      const enrichedRenting = await Promise.all(
        dashboard.rentals.map(async r => {
          let equipmentName = `Equipment #${r.equipment_id}`;
          let equipmentOwnerId = '';
          try {
            const eq = await getEquipmentById(r.equipment_id);
            equipmentName = eq.name;
            equipmentOwnerId = eq.ownerId;
          } catch { /* non-fatal */ }
          return { ...r, equipmentName, equipmentOwnerId };
        })
      );

      // ── Rented Out tab: rentals for equipment I own ──
      const allEquipment = await getAllEquipment();
      const myEquipment = allEquipment.filter(e => e.ownerId === user.id);
      const rentedOutRows: RentalDisplay[] = [];
      await Promise.all(
        myEquipment.map(async eq => {
          try {
            const rentals = await getRentalsForEquipment(eq.id);
            rentals.forEach(r => rentedOutRows.push({
              ...r,
              equipmentName: eq.name,
              equipmentOwnerId: user.id,
            }));
          } catch { /* ignore */ }
        })
      );
      rentedOutRows.sort((a, b) => b.id - a.id);

      const accountIds = new Set<number>();
      enrichedRenting.forEach(r => {
        const o = parseInt(r.equipmentOwnerId, 10);
        if (!Number.isNaN(o)) accountIds.add(o);
      });
      rentedOutRows.forEach(r => accountIds.add(r.renter_id));
      const accountFields: Record<number, { accountName: string; phoneNo: string }> = {};
      await Promise.all(
        [...accountIds].map(async id => {
          try {
            const a = await getAccount(id);
            accountFields[id] = { accountName: a.accountName, phoneNo: a.phoneNo };
          } catch { /* ignore */ }
        })
      );

      const rentingWithContact: RentalDisplay[] = enrichedRenting.map(r => {
        const o = parseInt(r.equipmentOwnerId, 10);
        const acc = accountFields[o];
        return acc ? { ...r, ownerName: acc.accountName, ownerPhone: acc.phoneNo } : r;
      });
      const rentedWithContact: RentalDisplay[] = rentedOutRows.map(r => {
        const acc = accountFields[r.renter_id];
        return acc ? { ...r, renterName: acc.accountName, renterPhone: acc.phoneNo } : r;
      });

      setRentingRentals(rentingWithContact);
      setRentedOutRentals(rentedWithContact);

      // ── Load damage claims for COMPLETED owner rentals ──
      const completedOwnerRentals = rentedWithContact.filter(r => r.status === 'COMPLETED');
      const claimMap: Record<number, ApiDamageClaim | null> = {};
      await Promise.all(
        completedOwnerRentals.map(async r => {
          try {
            const claim = await getDamageClaimByRental(r.id);
            claimMap[r.id] = claim;
          } catch {
            claimMap[r.id] = null; // no claim yet
          }
        })
      );
      setClaimsByRental(claimMap);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rentals');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Action helpers ──────────────────────────────────────────────────────────

  const runAction = async (rentalId: number, fn: () => Promise<ApiRental>) => {
    setActioning(prev => new Set(prev).add(rentalId));
    try {
      await fn();
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActioning(prev => { const s = new Set(prev); s.delete(rentalId); return s; });
    }
  };

  // ── Post-payment single rental view ────────────────────────────────────────

  if (isPostPayment && rentalIdParam) {
    return <PostPaymentView rentalIdParam={rentalIdParam} isMock={isMock} navigate={navigate} />;
  }

  // ── Main My Rentals view ────────────────────────────────────────────────────

  const activeList = topTab === 'renting' ? rentingRentals : rentedOutRentals;
  const filtered = activeList.filter(r => matchesFilter(r, filterTab));

  const filterCounts = {
    all:             activeList.length,
    'not-collected': activeList.filter(r => r.status === 'ACTIVE').length,
    'not-returned':  activeList.filter(r => r.status === 'COLLECTED').length,
    'not-reviewed':  activeList.filter(r => r.status === 'RETURNED').length,
    'completed':     activeList.filter(r => r.status === 'COMPLETED').length,
    'payment-due':   activeList.filter(r => r.status === 'PENDING' || r.status === 'LATE').length,
  };

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">My rentals</h1>
          <p className="text-sm text-gray-500 mt-1">Pickups, returns, and reviews for your bookings.</p>
        </header>

        {error && (
          <div className="flex items-center gap-2 text-red-800 bg-red-50 border border-red-200 rounded-xl p-3 mb-6 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Top tabs ─────────────────────────────────── */}
        <div className="flex p-1 rounded-xl bg-gray-100/90 gap-1 mb-6 max-w-md">
          {([
            { key: 'renting',    label: 'Renting',    count: rentingRentals.length },
            { key: 'rented-out', label: 'Rented out', count: rentedOutRentals.length },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => { setTopTab(t.key); setFilterTab('all'); }}
              className={`flex-1 min-w-0 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                topTab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span className="block truncate">{t.label}</span>
              <span className={`text-xs tabular-nums ${topTab === t.key ? 'text-gray-500' : 'text-gray-400'}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        {/* ── Filter tabs ──────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm mb-6">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Filter</p>
          <div className="flex flex-wrap gap-2">
            {([
              { key: 'all',           label: 'All' },
              { key: 'not-collected', label: 'Pickup' },
              { key: 'not-returned',  label: 'Return' },
              { key: 'not-reviewed',  label: 'Review' },
              { key: 'completed',     label: 'Completed' },
              { key: 'payment-due',   label: 'Outstanding payment' },
            ] as const).map(f => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilterTab(f.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterTab === f.key
                    ? f.key === 'payment-due'
                      ? 'bg-red-600 text-white'
                      : f.key === 'completed'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-blue-600 text-white'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {f.label}
                {filterCounts[f.key] > 0 && f.key !== 'all' && (
                  <span className={`tabular-nums rounded-md px-1.5 py-0.5 text-[10px] ${
                    filterTab === f.key ? 'bg-white/20 text-white' : 'bg-gray-200/80 text-gray-600'
                  }`}>
                    {filterCounts[f.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ──────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-gray-500">Loading rentals...</span>
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">
                {filterTab === 'all'
                  ? 'No rentals yet.'
                  : `No rentals need ${FILTER_EMPTY[filterTab]} right now.`}
              </p>
              {topTab === 'renting' && filterTab === 'all' && (
                <Button onClick={() => navigate('/marketplace')}>Browse Marketplace</Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filtered.map(rental => (
              <RentalCard
                key={rental.id}
                rental={rental}
                userId={user!.id}
                isOwnerView={topTab === 'rented-out'}
                isActioning={actioning.has(rental.id)}
                existingClaim={topTab === 'rented-out' ? (claimsByRental[rental.id] ?? null) : undefined}
                onCollect={() => runAction(rental.id, () => markCollected(rental.id, Number(user!.id)))}
                onConfirmReturn={() => runAction(rental.id, () => confirmReturn(rental.id, Number(user!.id)))}
                onOpenReview={() => setReviewRental(rental)}
                onFileClaim={() => navigate(`/damage-claim/${rental.id}`, {
                  state: {
                    equipmentName: rental.equipmentName,
                    renterName: rental.renterName ?? `Renter #${rental.renter_id}`,
                  }
                })}
                onViewClaim={() => {
                  const claim = claimsByRental[rental.id];
                  if (claim) navigate(`/damage-claim-result/${claim.claimID}`, {
                    state: {
                      equipmentName: rental.equipmentName,
                      renterName: rental.renterName ?? `Renter #${rental.renter_id}`,
                    }
                  });
                }}
                onNavigate={navigate}
              />
            ))}
          </div>
        )}

        <div className="flex mt-10 justify-center">
          <Button variant="outline" size="sm" onClick={() => navigate('/')}>Back to home</Button>
        </div>
      </div>
    </div>

    {user && (
      <RentalReviewDialog
        rental={reviewRental}
        userId={user.id}
        onClose={() => setReviewRental(null)}
        onSuccess={load}
      />
    )}
    </>
  );
};

// ─── Rental Card ──────────────────────────────────────────────────────────────

interface RentalCardProps {
  rental: RentalDisplay;
  userId: string;
  isOwnerView: boolean;
  isActioning: boolean;
  /** undefined = renter view / not applicable. null = no claim yet. object = claim exists. */
  existingClaim?: ApiDamageClaim | null;
  onCollect: () => void;
  onConfirmReturn: () => void;
  onOpenReview: () => void;
  onFileClaim: () => void;
  onViewClaim: () => void;
  onNavigate: ReturnType<typeof useNavigate>;
}

const RentalCard: React.FC<RentalCardProps> = ({
  rental, userId, isOwnerView, isActioning,
  existingClaim,
  onCollect, onConfirmReturn, onOpenReview, onFileClaim, onViewClaim, onNavigate,
}) => {
  const badge = STATUS_BADGE[rental.status] ?? { variant: 'outline' as const, label: rental.status };
  const isRenter = String(rental.renter_id) === userId;

  // Pickup dual-confirm
  const myPickupDone    = isOwnerView ? rental.owner_collected  : rental.renter_collected;
  const otherPickupDone = isOwnerView ? rental.renter_collected : rental.owner_collected;

  // Return dual-confirm
  const myReturnDone    = isRenter ? rental.renter_returned : rental.owner_returned;
  const otherReturnDone = isRenter ? rental.owner_returned  : rental.renter_returned;

  // Review dual-confirm
  const myReviewDone    = isRenter ? rental.renter_reviewed : rental.owner_reviewed;
  const otherReviewDone = isRenter ? rental.owner_reviewed  : rental.renter_reviewed;

  const accent =
    rental.status === 'LATE'      ? 'border-l-red-500' :
    rental.status === 'PENDING'   ? 'border-l-orange-400' :
    rental.status === 'ACTIVE'    ? 'border-l-sky-500' :
    rental.status === 'COLLECTED' ? 'border-l-amber-400' :
    rental.status === 'RETURNED'  ? 'border-l-violet-500' :
    rental.status === 'COMPLETED' ? 'border-l-emerald-500' :
    'border-l-gray-300';

  const contactLine = !isOwnerView && (rental.ownerName || rental.ownerPhone)
    ? [rental.ownerName, rental.ownerPhone].filter(Boolean).join(' · ')
    : isOwnerView && (rental.renterName || rental.renterPhone)
      ? [rental.renterName, rental.renterPhone].filter(Boolean).join(' · ')
      : '';

  // Damage claim badge label
  const claimBadgeLabel =
    existingClaim?.status === 'PENDING_STAFF_REVIEW' ? 'Claim: Pending Review' :
    existingClaim?.status === 'APPROVED'             ? 'Claim: Approved' :
    existingClaim?.status === 'REJECTED'             ? 'Claim: Rejected' :
    existingClaim?.status === 'DRAFT'                ? 'Claim: Draft' : '';

  return (
    <Card className={`border border-gray-200 rounded-lg shadow-sm overflow-hidden border-l-[3px] ${accent}`}>
      <CardContent className="p-3 sm:p-4">
        {/* Row 1: title + status + primary actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-sm sm:text-base text-gray-900 truncate">{rental.equipmentName}</h3>
              <Badge variant={badge.variant} className="shrink-0 text-[10px] sm:text-xs font-medium px-1.5 py-0">
                {badge.label}
              </Badge>
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              #{rental.id}
              {isOwnerView && (
                <>
                  {' · '}
                  {rental.renterName ?? `Renter #${rental.renter_id}`}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:shrink-0">

            {/* ── PENDING: pay button (renter only) ── */}
            {rental.status === 'PENDING' && isRenter && (
              <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => onNavigate(`/equipment/${rental.equipment_id}`)}>
                <CreditCard className="w-3 h-3" /> Pay
              </Button>
            )}

            {/* ── ACTIVE: pickup buttons ── */}
            {rental.status === 'ACTIVE' && !isOwnerView && !myPickupDone && (
              <Button size="sm" className="gap-1 h-8 text-xs" disabled={isActioning} onClick={onCollect}>
                {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                Confirm Pickup
              </Button>
            )}
            {rental.status === 'ACTIVE' && !isOwnerView && myPickupDone && !otherPickupDone && (
              <span className="text-[11px] text-gray-500">Waiting for owner</span>
            )}
            {rental.status === 'ACTIVE' && isOwnerView && !myPickupDone && (
              <Button size="sm" className="gap-1 h-8 text-xs" disabled={isActioning} onClick={onCollect}>
                {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Truck className="w-3 h-3" />}
                Confirm Pickup
              </Button>
            )}
            {rental.status === 'ACTIVE' && isOwnerView && myPickupDone && !otherPickupDone && (
              <span className="text-[11px] text-gray-500">Waiting for renter</span>
            )}

            {/* ── COLLECTED: return buttons ── */}
            {rental.status === 'COLLECTED' && !myReturnDone && (
              <Button size="sm" className="gap-1 h-8 text-xs" disabled={isActioning} onClick={onConfirmReturn}>
                {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                Confirm return
              </Button>
            )}
            {rental.status === 'COLLECTED' && myReturnDone && !otherReturnDone && (
              <span className="text-[11px] text-gray-500">Waiting for {isRenter ? 'owner' : 'renter'}</span>
            )}

            {/* ── RETURNED: review buttons ── */}
            {rental.status === 'RETURNED' && !myReviewDone && (
              <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" disabled={isActioning} onClick={onOpenReview}>
                {isActioning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Star className="w-3 h-3" />}
                Review
              </Button>
            )}
            {rental.status === 'RETURNED' && myReviewDone && !otherReviewDone && (
              <span className="text-[11px] text-gray-500">Waiting for {isRenter ? 'owner' : 'renter'}</span>
            )}

            {/* ── COMPLETED: done indicator + damage claim (owner only) ── */}
            {rental.status === 'COMPLETED' && !isOwnerView && (
              <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Done
              </span>
            )}
            {rental.status === 'COMPLETED' && isOwnerView && existingClaim === undefined && (
              <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Done
              </span>
            )}
            {rental.status === 'COMPLETED' && isOwnerView && existingClaim === null && (
              <Button size="sm" variant="outline" className="gap-1 h-8 text-xs border-red-200 text-red-700 hover:bg-red-50" onClick={onFileClaim}>
                <ShieldAlert className="w-3 h-3" /> File Claim
              </Button>
            )}
            {rental.status === 'COMPLETED' && isOwnerView && existingClaim != null && (
              <Button size="sm" variant="outline" className="gap-1 h-8 text-xs" onClick={onViewClaim}>
                <AlertCircle className="w-3 h-3" /> View Claim
              </Button>
            )}

            {/* ── LATE ── */}
            {rental.status === 'LATE' && isRenter && (
              <Button size="sm" variant="destructive" className="gap-1 h-8 text-xs" onClick={() => onNavigate(`/equipment/${rental.equipment_id}`)}>
                <CreditCard className="w-3 h-3" /> Pay late fee
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: contact · dates · place · rate */}
        <div className="mt-2 pt-2 border-t border-gray-100 text-[11px] sm:text-xs text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1">
          {contactLine && (
            <span className="text-gray-500">
              {!isOwnerView ? 'Owner' : 'Renter'} <span className="text-gray-800">{contactLine}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1 text-gray-500">
            <Calendar className="w-3 h-3 shrink-0 opacity-70" />
            {new Date(rental.start_time).toLocaleDateString()} – {new Date(rental.end_time).toLocaleDateString()}
          </span>
          <span className="inline-flex items-center gap-1 min-w-0 max-w-[200px] sm:max-w-none">
            <MapPin className="w-3 h-3 shrink-0 opacity-70" />
            <span className="truncate">{rental.pickup_location}</span>
          </span>
          <span className="font-medium text-gray-800 tabular-nums">${Number(rental.hourly_rate).toFixed(2)}/hr</span>
        </div>

        {rental.status === 'LATE' && (
          <div className="flex items-center gap-1.5 text-red-800 text-[11px] mt-2 bg-red-50 rounded px-2 py-1">
            <Clock className="w-3 h-3 shrink-0" />
            Late return — fees apply
          </div>
        )}

        {/* ── Dual-confirm rows ── */}
        {rental.status === 'ACTIVE' && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] bg-sky-50/90 rounded-md px-2 py-1.5 border border-sky-100/80">
            <span className="font-medium text-sky-950 shrink-0">Pickup</span>
            <ConfirmRow label="Renter" done={rental.renter_collected} />
            <ConfirmRow label="Owner"  done={rental.owner_collected} />
          </div>
        )}
        {rental.status === 'COLLECTED' && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] bg-amber-50/90 rounded-md px-2 py-1.5 border border-amber-100/80">
            <span className="font-medium text-amber-950 shrink-0">Return</span>
            <ConfirmRow label="Renter" done={rental.renter_returned} />
            <ConfirmRow label="Owner"  done={rental.owner_returned} />
          </div>
        )}
        {rental.status === 'RETURNED' && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] bg-violet-50/90 rounded-md px-2 py-1.5 border border-violet-100/80">
            <span className="font-medium text-violet-950 shrink-0">Review</span>
            <ConfirmRow label="Renter" done={rental.renter_reviewed} />
            <ConfirmRow label="Owner"  done={rental.owner_reviewed} />
          </div>
        )}

        {/* ── Claim status badge for completed owner rentals ── */}
        {rental.status === 'COMPLETED' && isOwnerView && existingClaim != null && claimBadgeLabel && (
          <div className="mt-2 text-[11px] text-gray-600 bg-gray-50 rounded-md px-2 py-1.5 border border-gray-100">
            {claimBadgeLabel}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ── Small helper ──────────────────────────────────────────────────────────────

const ConfirmRow: React.FC<{ label: string; done: boolean }> = ({ label, done }) => (
  <div className="inline-flex items-center gap-1">
    {done
      ? <CheckCircle className="w-3 h-3 text-emerald-600 shrink-0" />
      : <div className="w-3 h-3 rounded-full border border-gray-300 shrink-0" />}
    <span className={`text-[11px] ${done ? 'text-emerald-900 font-medium' : 'text-gray-600'}`}>
      {label}{done ? ' ✓' : ' …'}
    </span>
  </div>
);

// ── Post-payment view ─────────────────────────────────────────────────────────

const PostPaymentView: React.FC<{ rentalIdParam: string; isMock: boolean; navigate: ReturnType<typeof useNavigate> }> = ({ rentalIdParam, isMock, navigate }) => {
  const [rental, setRental] = useState<ApiRental | null>(null);
  const [equipmentName, setEquipmentName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRental(Number(rentalIdParam))
      .then(async r => {
        setRental(r);
        try {
          const eq = await getEquipmentById(r.equipment_id);
          setEquipmentName(eq.name);
        } catch { /* non-fatal */ }
      })
      .finally(() => setLoading(false));
  }, [rentalIdParam]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-lg p-8 mb-6 text-center shadow-sm">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-3xl mb-2">{isMock ? 'Booking Created!' : 'Payment Successful!'}</h1>
          <p className="text-gray-600">
            {isMock ? 'Mock mode — Stripe not configured.' : 'Confirmation SMS will be sent shortly.'}
          </p>
        </div>
        {rental && (
          <Card>
            <CardContent className="p-6 space-y-2">
              <h3 className="font-semibold text-lg">{equipmentName || `Equipment #${rental.equipment_id}`}</h3>
              <p className="text-sm text-gray-500">Rental #{rental.id}</p>
              <p className="text-sm text-gray-600">
                {new Date(rental.start_time).toLocaleDateString()} – {new Date(rental.end_time).toLocaleDateString()}
              </p>
              <p className="text-sm text-gray-600">{rental.pickup_location}</p>
            </CardContent>
          </Card>
        )}
        <div className="flex gap-4 mt-6 justify-center">
          <Button variant="outline" onClick={() => navigate('/my-rentals')}>View My Rentals</Button>
          <Button onClick={() => navigate('/marketplace')}>Browse More</Button>
        </div>
      </div>
    </div>
  );
};
