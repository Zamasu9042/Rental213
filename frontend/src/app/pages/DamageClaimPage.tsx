import React, { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { ChevronLeft, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { createDamageClaim, uploadDamagePhoto, analyzeDamageClaim } from '../../lib/api';

interface LocationState {
  equipmentName?: string;
  renterName?: string;
}

export const DamageClaimPage: React.FC = () => {
  const { rentalId } = useParams<{ rentalId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state as LocationState | null;
  const equipmentName = state?.equipmentName ?? 'Equipment';
  const renterName = state?.renterName ?? 'Renter';

  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const removeFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rentalId) { setError('No rental ID provided.'); return; }
    if (!selectedFile) { setError('Please upload at least one photo of the damage.'); return; }
    if (!description.trim()) { setError('Please describe the damage.'); return; }

    setError(null);
    setSubmitting(true);

    try {
      // 1. Create claim record
      const claim = await createDamageClaim(Number(rentalId));

      // 2. Upload the damage photo
      await uploadDamagePhoto(claim.claimID, selectedFile);

      // 3. Trigger AI analysis immediately
      const analyzed = await analyzeDamageClaim(claim.claimID);

      // 4. Navigate to result page
      navigate(`/damage-claim-result/${analyzed.claimID}`, {
        state: { equipmentName, renterName },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit claim. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

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

        <Card>
          <CardHeader>
            <CardTitle>File Damage Claim</CardTitle>
            <p className="text-sm text-gray-600 mt-2">
              Equipment: <span className="font-semibold">{equipmentName}</span>
            </p>
            <p className="text-sm text-gray-600">
              Last Rented By: <span className="font-semibold">{renterName}</span>
            </p>
            <p className="text-sm text-gray-500">
              Rental ID: <span className="font-mono">{rentalId}</span>
            </p>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Photo of Damage *</Label>

                {!previewUrl ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                    <input
                      type="file"
                      id="image-upload"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="image-upload" className="cursor-pointer">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600 mb-1">Click to upload a damage photo</p>
                      <p className="text-sm text-gray-500">PNG, JPG up to 10MB</p>
                    </label>
                  </div>
                ) : (
                  <div className="relative inline-block">
                    <img
                      src={previewUrl}
                      alt="Damage preview"
                      className="w-full max-h-64 object-cover rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={removeFile}
                      className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <p className="text-sm text-gray-500 mt-1">{selectedFile?.name}</p>
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description of Damage *</Label>
                <Textarea
                  id="description"
                  placeholder="Please describe the damage in detail..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  required
                />
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Your photo will be analyzed by Google Vision AI</li>
                  <li>• The AI detects damage type, severity, and confidence</li>
                  <li>• You can then review the analysis and approve or reject the claim</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <Button type="submit" className="flex-1 gap-2" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing damage...
                    </>
                  ) : (
                    'Submit & Analyze'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
