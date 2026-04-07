/**
 * StaffDashboardPage
 *
 * Staff sees two types of claims:
 *   PENDING_STAFF_REVIEW    — AI analysis done, staff reviews and approves/rejects AI result
 *   PENDING_STAFF_APPROVAL  — Owner submitted damage amount, staff reviews and approves/rejects amount
 *   AMOUNT_REJECTED         — shown for context (staff already rejected once)
 *
 * Staff Step 1 (PENDING_STAFF_REVIEW):
 *   Approve → claim moves to PENDING_OWNER_AMOUNT (owner enters amount next)
 *   Reject  → claim moves to REJECTED (closed)
 *
 * Staff Step 2 (PENDING_STAFF_APPROVAL):
 *   Approve → claim moves to APPROVED + Camunda starts damage-claim-workflow
 *   Reject  → claim moves to AMOUNT_REJECTED (owner re-enters amount)
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  ShieldCheck, Loader2, AlertTriangle, CheckCircle,
  XCircle, Cpu, RefreshCw, DollarSign, Clock,
} from 'lucide-react';
import {
  ApiDamageClaim,
  getPendingDamageClaims,
  resolveDamageClaim,
  reviewDamageAmount,
  damagePhotoUrl,
} from '../../lib/api';

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  PENDING_STAFF_REVIEW:    { label: 'Awaiting AI Review',      variant: 'default' },
  PENDING_STAFF_APPROVAL:  { label: 'Awaiting Amount Review',  variant: 'default' },
  AMOUNT_REJECTED:         { label: 'Amount Rejected',         variant: 'destructive' },
};

export const StaffDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [claims, setClaims]     = useState<ApiDamageClaim[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchClaims = () => {
    setLoading(true);
    setError(null);
    getPendingDamageClaims()
      .then(setClaims)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load claims'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClaims(); }, []);

  // Staff Step 1: approve/reject AI result
  const handleResolveAI = async (claimId: string, action: 'approve' | 'reject') => {
    setResolving(claimId);
    try {
      const updated = await resolveDamageClaim(claimId, action);
      // Remove from list — either moved to PENDING_OWNER_AMOUNT (owner's turn) or REJECTED
      setClaims(prev => prev.filter(c => c.claimID !== updated.claimID));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setResolving(null);
    }
  };

  // Staff Step 2: approve/reject owner's submitted amount
  const handleReviewAmount = async (claimId: string, action: 'approve' | 'reject') => {
    setResolving(claimId);
    try {
      const updated = await reviewDamageAmount(claimId, action);
      if (action === 'approve') {
        // APPROVED — remove from list, Camunda workflow started
        setClaims(prev => prev.filter(c => c.claimID !== updated.claimID));
      } else {
        // AMOUNT_REJECTED — update in place so staff can see it
        setClaims(prev => prev.map(c => c.claimID === updated.claimID ? updated : c));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setResolving(null);
    }
  };

  // Split claims by type for clarity
  const aiReviewClaims     = claims.filter(c => c.status === 'PENDING_STAFF_REVIEW');
  const amountReviewClaims = claims.filter(c =>
    c.status === 'PENDING_STAFF_APPROVAL' || c.status === 'AMOUNT_REJECTED'
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="w-6 h-6 text-blue-600" />
              <h1 className="text-3xl">Damage Claims</h1>
            </div>
            <p className="text-gray-500 text-sm">
              Review AI analysis results and owner-submitted damage amounts.
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={fetchClaims} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            <span className="text-gray-500">Loading pending claims...</span>
          </div>
        ) : claims.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-1">All clear!</h3>
              <p className="text-gray-500">No damage claims pending your review.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-10">

            {/* ── Step 1: AI review ── */}
            {aiReviewClaims.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-500" />
                  Step 1 — Review AI Analysis ({aiReviewClaims.length})
                </h2>
                <div className="space-y-6">
                  {aiReviewClaims.map(claim => (
                    <AIReviewCard
                      key={claim.claimID}
                      claim={claim}
                      isResolving={resolving === claim.claimID}
                      onApprove={() => handleResolveAI(claim.claimID, 'approve')}
                      onReject={() => handleResolveAI(claim.claimID, 'reject')}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* ── Step 2: Amount review ── */}
            {amountReviewClaims.length > 0 && (
              <section>
                <h2 className="text-base font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-500" />
                  Step 2 — Review Damage Amount ({amountReviewClaims.length})
                </h2>
                <div className="space-y-6">
                  {amountReviewClaims.map(claim => (
                    <AmountReviewCard
                      key={claim.claimID}
                      claim={claim}
                      isResolving={resolving === claim.claimID}
                      onApprove={() => handleReviewAmount(claim.claimID, 'approve')}
                      onReject={() => handleReviewAmount(claim.claimID, 'reject')}
                    />
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
};

// ─── AI Review Card ───────────────────────────────────────────────────────────

const AIReviewCard: React.FC<{
  claim: ApiDamageClaim;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
}> = ({ claim, isResolving, onApprove, onReject }) => {
  const severityColor =
    claim.severity === 'high'   ? 'text-red-600' :
    claim.severity === 'medium' ? 'text-amber-600' : 'text-green-600';

  return (
    <Card className="border-l-4 border-l-blue-400">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">
            Claim #{claim.claimID}
            <span className="ml-2 text-gray-400 font-normal text-sm">· Rental #{claim.rentalID}</span>
          </CardTitle>
          <Badge variant="default">Pending AI Review</Badge>
        </div>
        <p className="text-xs text-gray-400">
          Submitted: {claim.created_at ? new Date(claim.created_at).toLocaleString() : '—'}
          {claim.analyzed_at && ` · Analyzed: ${new Date(claim.analyzed_at).toLocaleString()}`}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {claim.photoURL && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">Damage Photo</p>
            <img
              src={damagePhotoUrl(claim.photoURL)}
              alt="Damage"
              className="w-full max-h-56 object-cover rounded-lg"
              onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x300?text=Photo+unavailable'; }}
            />
          </div>
        )}

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-900">AI Analysis Result</span>
            {(claim.analysis as any)?.source === 'mock' && (
              <Badge variant="outline" className="text-xs">Mock (no API key)</Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded p-2 text-center">
              <p className="text-xs text-gray-400 mb-1">Damage Type</p>
              <p className="text-sm font-semibold capitalize">
                {claim.damageType?.replace(/_/g, ' ') ?? '—'}
              </p>
            </div>
            <div className="bg-white rounded p-2 text-center">
              <p className="text-xs text-gray-400 mb-1">Severity</p>
              <p className={`text-sm font-semibold capitalize ${severityColor}`}>
                {claim.severity ?? '—'}
              </p>
            </div>
            <div className="bg-white rounded p-2 text-center">
              <p className="text-xs text-gray-400 mb-1">Confidence</p>
              <p className="text-sm font-semibold">
                {claim.confidence != null ? `${Math.round(claim.confidence * 100)}%` : '—'}
              </p>
            </div>
          </div>
          {(claim.analysis as any)?.labels?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {((claim.analysis as any).labels as string[]).map((label: string, i: number) => (
                <span key={i} className="bg-white border rounded px-2 py-0.5 text-xs text-gray-600">{label}</span>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
          Approving this will ask the owner to enter the damage amount they wish to claim.
        </p>

        <div className="flex gap-3 pt-1">
          <Button className="flex-1 gap-2" onClick={onApprove} disabled={isResolving}>
            {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Approve — Request Amount from Owner
          </Button>
          <Button variant="outline" className="flex-1 gap-2 text-gray-600" onClick={onReject} disabled={isResolving}>
            {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            Reject Claim
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ─── Amount Review Card ───────────────────────────────────────────────────────

const AmountReviewCard: React.FC<{
  claim: ApiDamageClaim;
  isResolving: boolean;
  onApprove: () => void;
  onReject: () => void;
}> = ({ claim, isResolving, onApprove, onReject }) => {
  const isRejected = claim.status === 'AMOUNT_REJECTED';

  return (
    <Card className={`border-l-4 ${isRejected ? 'border-l-red-400' : 'border-l-amber-400'}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">
            Claim #{claim.claimID}
            <span className="ml-2 text-gray-400 font-normal text-sm">· Rental #{claim.rentalID}</span>
          </CardTitle>
          <Badge variant={isRejected ? 'destructive' : 'default'}>
            {isRejected ? 'Amount Rejected — Owner Re-submitting' : 'Pending Amount Review'}
          </Badge>
        </div>
        <p className="text-xs text-gray-400">
          Submitted: {claim.created_at ? new Date(claim.created_at).toLocaleString() : '—'}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {claim.photoURL && (
          <img
            src={damagePhotoUrl(claim.photoURL)}
            alt="Damage"
            className="w-full max-h-40 object-cover rounded-lg"
            onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x300?text=Photo+unavailable'; }}
          />
        )}

        {/* Claimed amount */}
        <div className={`rounded-lg p-4 flex items-center gap-3 ${isRejected ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'}`}>
          <DollarSign className={`w-8 h-8 shrink-0 ${isRejected ? 'text-red-500' : 'text-amber-500'}`} />
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Owner is claiming</p>
            <p className="text-2xl font-bold text-gray-900">
              {claim.damageAmount != null ? `SGD ${Number(claim.damageAmount).toFixed(2)}` : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 bg-gray-50 rounded p-3">
          <div>
            <span className="font-medium">Damage type:</span>{' '}
            {claim.damageType?.replace(/_/g, ' ') ?? '—'}
          </div>
          <div>
            <span className="font-medium">Severity:</span>{' '}
            <span className="capitalize">{claim.severity ?? '—'}</span>
          </div>
        </div>

        {isRejected && (
          <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 text-xs">
            <Clock className="w-3 h-3 shrink-0" />
            You rejected the previous amount. Waiting for owner to re-submit.
          </div>
        )}

        {!isRejected && (
          <p className="text-xs text-gray-500 bg-gray-50 rounded p-2">
            Approving will charge the renter SGD {claim.damageAmount != null ? Number(claim.damageAmount).toFixed(2) : '0.00'} and
            mark the equipment as under repair. Rejecting lets the owner re-enter the amount.
          </p>
        )}

        {claim.status === 'PENDING_STAFF_APPROVAL' && (
          <div className="flex gap-3 pt-1">
            <Button className="flex-1 gap-2" onClick={onApprove} disabled={isResolving}>
              {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approve — Charge Renter SGD {claim.damageAmount != null ? Number(claim.damageAmount).toFixed(2) : '0.00'}
            </Button>
            <Button variant="outline" className="flex-1 gap-2 text-gray-600" onClick={onReject} disabled={isResolving}>
              {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
              Reject Amount
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};