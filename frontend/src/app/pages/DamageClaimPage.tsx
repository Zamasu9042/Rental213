import React, { useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { ChevronLeft, Upload, X } from 'lucide-react';

interface LocationState {
  equipmentName: string;
  lastRenter: {
    renterName: string;
  };
}

export const DamageClaimPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, addDamageClaim } = useApp();
  
  const state = location.state as LocationState;
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<string[]>([]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // Mock image upload - in real app, would upload to server
      const newImages = Array.from(files).map((file, idx) => 
        `https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=400&h=400&fit=crop&seed=${idx}`
      );
      setImages([...images, ...newImages]);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!id || !state || images.length === 0) {
      alert('Please add at least one image of the damage');
      return;
    }

    const claim = {
      id: `claim-${Date.now()}`,
      equipmentId: id,
      equipmentName: state.equipmentName,
      renterId: 'renter-123',
      renterName: state.lastRenter.renterName,
      images,
      description,
      date: new Date().toISOString(),
    };

    addDamageClaim(claim);
    navigate(`/damage-claim-result/${claim.id}`, { state: { claim } });
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
              Equipment: <span className="font-semibold">{state?.equipmentName}</span>
            </p>
            <p className="text-sm text-gray-600">
              Last Rented By: <span className="font-semibold">{state?.lastRenter.renterName}</span>
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Photos of Damage *</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <label htmlFor="image-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-1">Click to upload damage photos</p>
                    <p className="text-sm text-gray-500">PNG, JPG up to 10MB</p>
                  </label>
                </div>

                {/* Image Previews */}
                {images.length > 0 && (
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative group">
                        <img 
                          src={img} 
                          alt={`Damage ${idx + 1}`}
                          className="w-full h-32 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => removeImage(idx)}
                          className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
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
                  rows={6}
                  required
                />
              </div>

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">What happens next?</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• The renter will be notified of the damage claim</li>
                  <li>• They will have 48 hours to respond</li>
                  <li>• Our team will review the claim and photos</li>
                  <li>• Resolution typically takes 3-5 business days</li>
                </ul>
              </div>

              <div className="flex gap-4">
                <Button type="submit" className="flex-1">
                  Submit Claim
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  onClick={() => navigate(-1)}
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
