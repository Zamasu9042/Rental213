/**
 * DamageClaimResultPage
 *
 * Shows the current state of a damage claim and renders the correct UI
 * based on who is viewing and what stage the claim is at.
 *
 * Status → UI mapping:
 *
 *   PENDING_STAFF_REVIEW    Owner: "Awaiting staff review of AI result"
 *                           Staff: handled in StaffDashboardPage
 *
 *   PENDING_OWNER_AMOUNT    Owner: form to enter damage amount
 *                           Staff: "Waiting for owner to submit amount"
 *
 *   PENDING_STAFF_APPROVAL  Owner: "Amount submitted — awaiting staff approval"
 *                           Staff: handled in StaffDashboardPage
 *
 *   AMOUNT_REJECTED         Owner: form to re-enter damage amount (with rejection notice)
 *
 *   APPROVED                Owner + Staff: claim fully approved, Camunda started
 *   REJECTED                Owner + Staff: claim rejected
 */

import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  ChevronLeft, Cpu, AlertTriangle, CheckCircle, XCircle,
  Loader2, Clock, DollarSign,
} from 'lucide-react';
import {
  ApiDamageClaim,
  getDamageClaim,
  submitDamageAmount,
  damagePhotoUrl,
} from '../../lib/api';

interface LocationState {
  equipmentName?: string;
  renterName?: string;
}

const STATUS_BADGE: Record<string, {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  label: string;
}> = {
  DRAFT:                   { variant: 'outline',     label: 'Draft' },
  PENDING_STAFF_REVIEW:    { variant: 'default',     label: 'Pending AI Review' },
  PENDING_OWNER_AMOUNT:    { variant: 'default',     label: 'Enter Amount' },
  PENDING_STAFF_APPROVAL:  { variant: 'default',     label: 'Pending Amount Approval' },
  AMOUNT_REJECTED:         { variant: 'destructive', label: 'Amount Rejected — Re-enter' },
  APPROVED:                { variant: 'secondary',   label: 'Approved' },
  REJECTED:                { variant: 'destructive', label: 'Rejected' },
};

export const DamageClaimResultPage: React.FC = () => {
  const { claimId }  = useParams<{ claimId: string }>();
  const location     = useLocation();
  const navigate     = useNavigate();
  const { user }     = useApp();
  const isStaff      = user?.role === 'staff';

  const state         = location.state as LocationState | null;
  const equipmentName = state?.equipmentName ?? 'Equipment';
  const renterName    = state?.renterName    ?? 'Renter';

  const [claim, setClaim]       = useState<ApiDamageClaim | null>(null);
  const [loading, setLoading]   = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Amount entry state
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    if (!claimId) return;
    getDamageClaim(claimId)
      .then(c => { setClaim(c); setAmountInput(''); })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load claim'))
      .finally(() => setLoading(false));
  }, [claimId]);

  const handleSubmitAmount = async () => {
    const parsed = parseFloat(amountInput);
    if (!amountInput || isNaN(parsed) || parsed <= 0) {
      setAmountError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!claimId) return;
    setAmountError('');
    setSubmitting(true);
    try {
      const updated = await submitDamageAmount(claimId, parsed);
      setClaim(updated);
      setAmountInput('');
    } catch (err) {
      setAmountError(err instanceof Error ? err.message : 'Failed to submit amount.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600 mr-2" />
      <span className="text-gray-500">Loading claim...</span>
    </div>
  );

  if (!claim) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h2 className="text-2xl mb-4">Claim not found</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        <Button onClick={() => navigate('/my-listings')}>Back to My Listings</Button>
      </div>
    </div>
  );

  const badge      = STATUS_BADGE[claim.status] ?? { variant: 'outline' as const, label: claim.status };
  const isAnalyzed = !['DRAFT'].includes(claim.status);
  const severityColor =
    claim.severity === 'high'   ? 'text-red-600' :
    claim.severity === 'medium' ? 'text-amber-600' : 'text-green-600';

  const needsOwnerAmount =
    claim.status === 'PENDING_OWNER_AMOUNT' || claim.status === 'AMOUNT_REJECTED';

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
              {' · '}Rental: <span className="font-mono">#{claim.rentalID}</span>
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

          {/* Damage photo */}
          {claim.photoURL && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Submitted Photo</CardTitle>
              </CardHeader>
              <CardContent>
                <img
                  src={damagePhotoUrl(claim.photoURL)}
                  alt="Damage"
                  className="w-full max-h-72 object-cover rounded-lg"
                  onError={e => {
                    (e.target as HTMLImageElement).src = 'https://placehold.co/600x300?text=Photo+not+available';
                  }}
                />
              </CardContent>
            </Card>
          )}

          {/* AI Analysis */}
          {isAnalyzed && (
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-blue-600" />
                  Google Vision AI Analysis
                  <Badge variant="secondary" className="ml-auto">Analysed</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Damage Type</p>
                      <p className="font-semibold text-sm capitalize">
                        {claim.damageType?.replace(/_/g, ' ') ?? '—'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Severity</p>
                      <p className={`font-semibold text-sm capitalize ${severityColor}`}>
                        {claim.severity ?? '—'}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Confidence</p>
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
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Owner: enter / re-enter damage amount ── */}
          {!isStaff && needsOwnerAmount && (
            <Card className={claim.status === 'AMOUNT_REJECTED' ? 'border-red-300' : 'border-amber-300'}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-amber-500" />
                  {claim.status === 'AMOUNT_REJECTED'
                    ? 'Re-enter Damage Amount'
                    : 'Enter Damage Amount'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {claim.status === 'AMOUNT_REJECTED' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Amount rejected by staff</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        Your previous amount of{' '}
                        <span className="font-semibold">
                          SGD {claim.damageAmount != null ? Number(claim.damageAmount).toFixed(2) : '—'}
                        </span>{' '}
                        was rejected. Please enter a revised amount.
                      </p>
                    </div>
                  </div>
                )}

                <p className="text-sm text-gray-600">
                  The staff has confirmed the damage. Please enter the amount (SGD) you wish to
                  claim from the renter to cover repair costs.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="damage-amount">Damage Amount (SGD)</Label>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                      <Input
                        id="damage-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder="0.00"
                        className="pl-7"
                        value={amountInput}
                        onChange={e => { setAmountInput(e.target.value); setAmountError(''); }}
                      />
                    </div>
                    <Button onClick={handleSubmitAmount} disabled={submitting} className="gap-2">
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                      Submit Amount
                    </Button>
                  </div>
                  {amountError && (
                    <p className="text-xs text-red-600">{amountError}</p>
                  )}
                </div>

                <p className="text-xs text-gray-400">
                  Staff will review your claimed amount before the renter is charged.
                </p>
              </CardContent>
            </Card>
          )}

          {/* ── Owner: submitted, waiting for staff approval ── */}
          {!isStaff && claim.status === 'PENDING_STAFF_APPROVAL' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Amount Under Review</p>
                <p className="text-sm">
                  Your claimed amount of{' '}
                  <span className="font-semibold">
                    SGD {claim.damageAmount != null ? Number(claim.damageAmount).toFixed(2) : '—'}
                  </span>{' '}
                  is being reviewed by staff.
                </p>
              </div>
            </div>
          )}

          {/* ── Owner: awaiting staff AI review ── */}
          {!isStaff && claim.status === 'PENDING_STAFF_REVIEW' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Awaiting Staff Review</p>
                <p className="text-sm">Your claim has been submitted and is pending staff review of the AI analysis.</p>
              </div>
            </div>
          )}

          {/* ── APPROVED ── */}
          {claim.status === 'APPROVED' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Claim Fully Approved</p>
                <p className="text-sm">
                  SGD {claim.damageAmount != null ? Number(claim.damageAmount).toFixed(2) : '—'} damage fee approved.
                  The renter will receive a payment request and the equipment has been marked under repair.
                </p>
              </div>
            </div>
          )}

          {/* ── REJECTED ── */}
          {claim.status === 'REJECTED' && (
            <div className="bg-gray-50 border rounded-lg p-4 flex items-center gap-3 text-gray-700">
              <XCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Claim Rejected</p>
                <p className="text-sm">The damage claim was rejected by staff after reviewing the AI analysis.</p>
              </div>
            </div>
          )}

          {/* Warning for AI analysis */}
          {isAnalyzed && !['APPROVED', 'REJECTED'].includes(claim.status) && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              A maintenance officer will verify the AI result before the claim is confirmed.
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