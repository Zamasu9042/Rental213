import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  ShieldCheck,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import {
  ApiDamageClaim,
  getPendingDamageClaims,
  resolveDamageClaim,
  damagePhotoUrl,
} from '../../lib/api';

export const StaffDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [claims, setClaims] = useState<ApiDamageClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null); // claimID being resolved

  const fetchClaims = () => {
    setLoading(true);
    setError(null);
    getPendingDamageClaims()
      .then(setClaims)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load claims'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchClaims(); }, []);

  const handleResolve = async (claimId: string, action: 'approve' | 'reject') => {
    setResolving(claimId);
    try {
      const updated = await resolveDamageClaim(claimId, action);
      // Remove from pending list once resolved
      setClaims(prev => prev.filter(c => c.claimID !== updated.claimID));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve claim');
    } finally {
      setResolving(null);
    }
  };

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
              Review AI-analyzed damage claims and approve or reject them.
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
              <p className="text-gray-500">No damage claims pending review.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-gray-500">{claims.length} claim{claims.length !== 1 ? 's' : ''} pending your review</p>

            {claims.map(claim => {
              const isResolving = resolving === claim.claimID;
              const severityColor =
                claim.severity === 'high' ? 'text-red-600' :
                claim.severity === 'medium' ? 'text-amber-600' : 'text-green-600';

              return (
                <Card key={claim.claimID} className="border-l-4 border-l-blue-400">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base">
                        Claim #{claim.claimID}
                        <span className="ml-2 text-gray-400 font-normal text-sm">
                          · Rental #{claim.rentalID}
                        </span>
                      </CardTitle>
                      <Badge variant="default">Pending Review</Badge>
                    </div>
                    <p className="text-xs text-gray-400">
                      Submitted: {claim.created_at ? new Date(claim.created_at).toLocaleString() : '—'}
                      {claim.analyzed_at && ` · Analyzed: ${new Date(claim.analyzed_at).toLocaleString()}`}
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Photo */}
                    {claim.photoURL && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">Damage Photo</p>
                        <img
                          src={damagePhotoUrl(claim.photoURL)}
                          alt="Damage"
                          className="w-full max-h-56 object-cover rounded-lg"
                          onError={e => {
                            (e.target as HTMLImageElement).src = 'https://placehold.co/600x300?text=Photo+unavailable';
                          }}
                        />
                      </div>
                    )}

                    {/* AI Analysis */}
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
                            <span key={i} className="bg-white border rounded px-2 py-0.5 text-xs text-gray-600">
                              {label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                      <Button
                        className="flex-1 gap-2"
                        onClick={() => handleResolve(claim.claimID, 'approve')}
                        disabled={isResolving}
                      >
                        {isResolving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        Approve Claim
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 gap-2 text-gray-600"
                        onClick={() => handleResolve(claim.claimID, 'reject')}
                        disabled={isResolving}
                      >
                        {isResolving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        Reject Claim
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
