import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ChevronLeft, Cpu, AlertTriangle, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import {
  ApiDamageClaim,
  getDamageClaim,
  resolveDamageClaim,
  damagePhotoUrl,
} from '../../lib/api';

interface LocationState {
  equipmentName?: string;
  renterName?: string;
}

const STATUS_BADGE: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  DRAFT:                { variant: 'outline',     label: 'Draft' },
  PENDING_STAFF_REVIEW: { variant: 'default',     label: 'Pending Review' },
  APPROVED:             { variant: 'secondary',   label: 'Approved' },
  REJECTED:             { variant: 'destructive', label: 'Rejected' },
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
  const isAnalyzed = claim.status === 'PENDING_STAFF_REVIEW' || claim.status === 'APPROVED' || claim.status === 'REJECTED';
  const canResolve = claim.status === 'PENDING_STAFF_REVIEW';

  const severityColor =
    claim.severity === 'high' ? 'text-red-600' :
    claim.severity === 'medium' ? 'text-amber-600' : 'text-green-600';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
        >
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
              <CardHeader>
                <CardTitle className="text-base">Submitted Photo</CardTitle>
              </CardHeader>
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
                {isAnalyzed && (
                  <Badge variant="secondary" className="ml-auto">Analysed</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!isAnalyzed ? (
                <div className="text-center py-6">
                  <p className="text-gray-500 text-sm">
                    Analysis was not completed. Please resubmit the claim.
                  </p>
                </div>
              ) : (
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

          {/* Resolve Actions — staff only */}
          {canResolve && isStaff && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Staff Decision</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Review the AI analysis above and confirm or reject this damage claim.
                </p>
                <div className="flex gap-3">
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => handleResolve('approve')}
                    disabled={resolving}
                  >
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Approve Claim
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 text-gray-600"
                    onClick={() => handleResolve('reject')}
                    disabled={resolving}
                  >
                    {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Reject Claim
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Owner — waiting for staff review */}
          {canResolve && !isStaff && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3 text-yellow-800">
              <Clock className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Awaiting Staff Review</p>
                <p className="text-sm">Your claim has been submitted and is pending staff approval.</p>
              </div>
            </div>
          )}

          {claim.status === 'APPROVED' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Claim Approved</p>
                <p className="text-sm">The damage claim has been confirmed and recorded.</p>
              </div>
            </div>
          )}

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
