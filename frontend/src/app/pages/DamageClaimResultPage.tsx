import React from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ChevronLeft, Cpu, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { DamageClaim } from '../context/AppContext';

interface LocationState {
  claim: DamageClaim;
}

// Mock AI analysis results — in the real system this comes back from Google Vision API
const MOCK_AI_RESULT = {
  damageType: 'Surface Scratch & Handle Grip Damage',
  severity: 'Moderate',
  confidence: 0.87,
  estimatedCost: 45,
};

export const DamageClaimResultPage: React.FC = () => {
  const { claimId } = useParams<{ claimId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { damageClaims, updateDamageClaim } = useApp();

  const state = location.state as LocationState | null;
  const claim = damageClaims.find(c => c.id === claimId) ?? state?.claim;

  if (!claim) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Claim not found</h2>
          <Button onClick={() => navigate('/my-listings')}>Back to My Listings</Button>
        </div>
      </div>
    );
  }

  const liveClaim = damageClaims.find(c => c.id === claim.id) ?? claim;
  const aiResult = liveClaim.aiAnalysis ?? MOCK_AI_RESULT;
  const isAnalyzed = liveClaim.status !== 'pending';

  const handleAnalyze = () => {
    updateDamageClaim(claim.id, {
      status: 'ai-analyzed',
      aiAnalysis: MOCK_AI_RESULT,
    });
  };

  const handleConfirm = () => {
    updateDamageClaim(claim.id, { status: 'confirmed' });
    navigate('/my-listings');
  };

  const handleReject = () => {
    updateDamageClaim(claim.id, { status: 'rejected' });
    navigate('/my-listings');
  };

  const severityColor = {
    Low: 'text-green-600',
    Moderate: 'text-amber-600',
    High: 'text-red-600',
  }[aiResult.severity] ?? 'text-gray-600';

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

        <div className="mb-6">
          <h1 className="text-2xl mb-1">Damage Claim</h1>
          <p className="text-gray-600 text-sm">
            Equipment: <span className="font-semibold">{claim.equipmentName}</span>
            {' · '}Renter: <span className="font-semibold">{claim.renterName}</span>
          </p>
        </div>

        <div className="space-y-6">
          {/* Submitted Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submitted Photos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {claim.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`Damage ${idx + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                ))}
              </div>
              {claim.description && (
                <p className="mt-4 text-sm text-gray-700 bg-gray-50 p-3 rounded">
                  {claim.description}
                </p>
              )}
            </CardContent>
          </Card>

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
                  <p className="text-gray-600 mb-4 text-sm">
                    Run AI analysis on the submitted photos to detect damage type, severity, and estimated repair cost.
                  </p>
                  <Button onClick={handleAnalyze} className="gap-2">
                    <Cpu className="w-4 h-4" />
                    Run AI Analysis
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Damage Type</p>
                      <p className="font-semibold text-sm">{aiResult.damageType}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Severity</p>
                      <p className={`font-semibold text-sm ${severityColor}`}>{aiResult.severity}</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">AI Confidence</p>
                      <p className="font-semibold text-sm">{Math.round(aiResult.confidence * 100)}%</p>
                    </div>
                    <div className="bg-gray-50 rounded p-3">
                      <p className="text-xs text-gray-500 mb-1">Estimated Repair Cost</p>
                      <p className="font-semibold text-sm text-red-600">${aiResult.estimatedCost}</p>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                    <AlertTriangle className="w-4 h-4 inline mr-1" />
                    A maintenance officer should verify this estimate before confirming the claim.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          {liveClaim.status === 'ai-analyzed' && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold mb-2">Confirm Claim</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Confirming will deduct <span className="font-semibold text-red-600">${aiResult.estimatedCost}</span> from
                  the renter's deposit and transfer it to you. The renter's reputation score will also be deducted.
                </p>
                <div className="flex gap-3">
                  <Button className="flex-1 gap-2" onClick={handleConfirm}>
                    <CheckCircle className="w-4 h-4" />
                    Confirm & Process Payment
                  </Button>
                  <Button variant="outline" className="gap-2 text-gray-600" onClick={handleReject}>
                    <XCircle className="w-4 h-4" />
                    Reject Claim
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {liveClaim.status === 'confirmed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3 text-green-800">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Claim Confirmed</p>
                <p className="text-sm">Compensation of ${aiResult.estimatedCost} has been processed.</p>
              </div>
            </div>
          )}

          {liveClaim.status === 'rejected' && (
            <div className="bg-gray-50 border rounded-lg p-4 flex items-center gap-3 text-gray-700">
              <XCircle className="w-5 h-5 shrink-0" />
              <p className="font-semibold">Claim Rejected</p>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => navigate('/my-listings')}>
            Back to My Listings
          </Button>
        </div>
      </div>
    </div>
  );
};
