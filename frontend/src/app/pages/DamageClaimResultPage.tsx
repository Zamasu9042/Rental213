import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ChevronLeft, Cpu, AlertTriangle, CheckCircle, XCircle, Loader2, Clock, DollarSign } from 'lucide-react';
import {
  ApiDamageClaim,
  getDamageClaim,
  resolveDamageClaim,
  submitDamageAmount,
  reviewDamageAmount,
  damagePhotoUrl,
} from '../../lib/api';

interface LocationState {
  equipmentName?: string;
  renterName?: string;
}

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  DRAFT:                  { variant: 'outline',     label: 'Draft' },
  PENDING_STAFF_REVIEW:   { variant: 'default',     label: 'Pending Review' },
  PENDING_OWNER_AMOUNT:   { variant: 'default',     label: 'Awaiting Amount' },
  PENDING_STAFF_APPROVAL: { variant: 'default',     label: 'Pending Approval' },
  AMOUNT_REJECTED:        { variant: 'destructive', label: 'Amount Rejected' },
  APPROVED:               { variant: 'secondary',   label: 'Approved' },
  REJECTED:               { variant: 'destructive', label: 'Rejected' },
};

export const DamageClaimResultPage: React.FC = () => {
  const { claimId } = useParams<{ claimId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useApp();
  const isStaff = user?.role === 'staff';

  const state = location.state as LocationState | null;
  const equipmentName = state?.equipmentName ?? 'Equipment';
  const renterName = state?.renterName ?? 'Renter';

  const [claim, setClaim] = useState<ApiDamageClaim | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Owner amount submission
  const [amountInput, setAmountInput] = useState('');
  const [submittingAmount, setSubmittingAmount] = useState(false);

  useEffect(() => {
    if (!claimId) return;
    getDamageClaim(claimId)
      .then(setClaim)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load claim'))
      .finally(() => setLoading(false));
  }, [claimId]);

  const handleResolve = async (action: 'approve' | 'reject') => {
    if (!claimId) return;
    setResolving(true);
    try {
      const updated = await resolveDamageClaim(claimId, action);
      setClaim(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve claim');
    } finally {
      setResolving(false);
    }
  };

  const handleReviewAmount = async (action: 'approve' | 'reject') => {
    if (!claimId) return;
    setResolving(true);
    try {
      const updated = await reviewDamageAmount(claimId, action);
      setClaim(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review amount');
    } finally {
      setResolving(false);
    }
  };

  const handleSubmitAmount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimId) return;
    const amt = parseFloat(amountInput);
    if (isNaN(amt) || amt <= 0) {
      setError('Please enter a valid amount greater than $0.');
      return;
    }
    setError(null);
    setSubmittingAmount(true);
    try {
      const updated = await submitDamageAmount(claimId, amt);
      setClaim(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit amount');
    } finally {
      setSubmittingAmount(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
        <span className="text-gray-500">Loading claim...</span>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Claim not found</h2>
          {error && <p className="text-red-600 mb-4">{error}</p>}
          <Button onClick={() => navigate('/my-listings')}>Back to My Listings</Button>
        </div>
      </div>
    );
  }

  const badge = STATUS_BADGE[claim.status] ?? { variant: 'outline' as const, label: claim.status };
  const isAnalyzed = ['PENDING_STAFF_REVIEW', 'PENDING_OWNER_AMOUNT', 'PENDING_STAFF_APPROVAL', 'AMOUNT_REJECTED', 'APPROVED', 'REJECTED'].includes(claim.status);

  const severityColor =
    claim.severity === 'high' ? 'text-red-600' :
    claim.severity === 'medium' ? 'text-amber-600' : 'text-green-600';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6 gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl mb-1">Damage Claim #{claim.claimID}</h1>
            <p className="text-gray-600 text-sm">
              Equipment: <span className="font-semibold">{equipmentName}</span>
              {' · '}Renter: <span className="font-semibold">{renterName}</span>
              {' · '}Rental ID: <span className="font-mono">{claim.rentalID}</span>
            </p>
          </div>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        {error && (
          <div className="mb-4 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Submitted Photo */}
          {claim.photoURL && (
            <Card>
              <CardHeader><CardTitle className="text-base">Submitted Photo</CardTitle></CardHeader>
              <CardContent>
                <img
                  src={damagePhotoUrl(claim.photoURL)}
                  alt="Damage"
                  className="w-full max-h-72 object-cover rounded-lg"
                  onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/600x300?text=Photo+not+available'; }}
                />
              </CardContent>
            </Card>
          )}

          {/* AI Analysis */}
          <Card className={isAnalyzed ? 'border-blue-200' : ''}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="w-5 h-5 text-blue-600" />
                Google Vision AI Analysis
                {isAnalyzed && <Badge variant="secondary" className="ml-auto">Analysed</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isAnalyzed ? (
                <p className="text-gray-500 text-sm text-center py-6">Analysis not completed. Please resubmit.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Damage Type</p>
                      <p className="font-semibold text-sm capitalize">{claim.damageType?.replace(/_/g, ' ') ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Severity</p>
                      <p className={`font-semibold text-sm capitalize ${severityColor}`}>{claim.severity ?? '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">AI Confidence</p>
                      <p className="font-semibold text-sm">
                        {claim.confidence != null ? `${Math.round(claim.confidence * 100)}%` : '—'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Source</p>
                      <p className="font-semibold text-sm">
                        {(claim.analysis as any)?.source === 'mock' ? 'Mock (no API key)' : 'Google Vision API'}
                      </p>
                    </div>
                  </div>
                  {(claim.analysis as any)?.labels?.length > 0 && (
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-2">Detected Labels</p>
                      <div className="flex flex-wrap gap-1">
                        {((claim.analysis as any).labels as string[]).map((label: string, i: number) => (
                          <span key={i} className="bg-white border rounded px-2 py-0.5 text-xs">{label}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    A maintenance officer should verify the AI result before confirming the claim.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Staff Step 1: Approve/Reject AI result ── */}
          {claim.status === 'PENDING_STAFF_REVIEW' && isStaff && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Staff Decision — AI Result</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Approve to request the owner enter a damage amount. Reject to close the claim.
                </p>
                <div className="flex gap-3">
                  <Button className="flex-1 gap-2" onClick={() => handleResolve('approve')} disabled={resolving}>
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Approve AI Result
                  </Button>
                  <Button variant="outline" className="gap-2 text-gray-600" onClick={() => handleResolve('reject')} disabled={resolving}>
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Reject Claim
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Owner waiting for staff Step 1 review */}
          {claim.status === 'PENDING_STAFF_REVIEW' && !isStaff && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Awaiting Staff Review</p>
                <p className="text-sm">Your claim is pending staff approval of the AI analysis.</p>
              </div>
            </div>
          )}

          {/* ── Owner Step: Enter damage amount ── */}
          {(claim.status === 'PENDING_OWNER_AMOUNT' || claim.status === 'AMOUNT_REJECTED') && !isStaff && (
            <Card className="border-amber-200">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-1 flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-amber-600" />
                  {claim.status === 'AMOUNT_REJECTED' ? 'Revise Damage Amount' : 'Enter Damage Amount'}
                </h3>
                {claim.status === 'AMOUNT_REJECTED' && (
                  <p className="text-sm text-red-600 mb-3">Staff rejected your previous amount. Please revise and resubmit.</p>
                )}
                {claim.status === 'PENDING_OWNER_AMOUNT' && (
                  <p className="text-sm text-gray-600 mb-3">The AI analysis was approved. Please enter the damage repair amount you are claiming.</p>
                )}
                <form onSubmit={handleSubmitAmount} className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="damage-amount">Damage Amount (SGD)</Label>
                    <Input
                      id="damage-amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 150.00"
                      value={amountInput}
                      onChange={e => setAmountInput(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={submittingAmount} className="w-full">
                    {submittingAmount ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Submit Amount for Staff Review
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Staff sees the amount — but can't act yet (owner hasn't submitted) */}
          {claim.status === 'PENDING_OWNER_AMOUNT' && isStaff && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Waiting for Owner to Submit Amount</p>
                <p className="text-sm">The owner has been notified. This claim will reappear once they submit.</p>
              </div>
            </div>
          )}

          {/* ── Staff Step 2: Review damage amount ── */}
          {claim.status === 'PENDING_STAFF_APPROVAL' && isStaff && (
            <Card className="border-amber-200">
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Staff Decision — Damage Amount</h3>
                <p className="text-sm text-gray-600 mb-1">Owner has submitted a damage claim amount:</p>
                <p className="text-2xl font-bold text-amber-700 mb-4">
                  ${claim.damageAmount?.toFixed(2) ?? '—'}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  Approve to charge the renter via Stripe and mark equipment for repair. Reject to ask the owner to revise.
                </p>
                <div className="flex gap-3">
                  <Button className="flex-1 gap-2" onClick={() => handleReviewAmount('approve')} disabled={resolving}>
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Approve & Charge Renter
                  </Button>
                  <Button variant="outline" className="flex-1 gap-2 text-gray-600" onClick={() => handleReviewAmount('reject')} disabled={resolving}>
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Reject Amount
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Owner waiting for staff Step 2 review */}
          {claim.status === 'PENDING_STAFF_APPROVAL' && !isStaff && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Awaiting Staff Approval</p>
                <p className="text-sm">Your damage amount of ${claim.damageAmount?.toFixed(2)} is pending staff review.</p>
              </div>
            </div>
          )}

          {/* Amount rejected — owner shown form above; staff sees info */}
          {claim.status === 'AMOUNT_REJECTED' && isStaff && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-center gap-3 text-orange-800">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Amount Rejected — Awaiting Owner Revision</p>
                <p className="text-sm">The owner has been asked to resubmit a revised amount.</p>
              </div>
            </div>
          )}

          {/* Approved */}
          {claim.status === 'APPROVED' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Claim Approved — Payment Requested</p>
                <p className="text-sm">
                  A damage fee of ${claim.damageAmount?.toFixed(2)} has been requested from the renter.
                  Equipment has been marked for repair.
                </p>
              </div>
            </div>
          )}

          {/* Rejected */}
          {claim.status === 'REJECTED' && (
            <div className="bg-gray-50 border rounded-lg p-4 flex items-center gap-3 text-gray-700">
              <XCircle className="w-5 h-5 shrink-0" />
              <p className="font-semibold">Claim Rejected</p>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => navigate(isStaff ? '/staff-dashboard' : '/my-listings')}
          >
            {isStaff ? 'Back to Damage Claims' : 'Back to My Listings'}
          </Button>
        </div>
      </div>
    </div>
  );
};
