import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { differenceInDays } from 'date-fns';
import { ChevronLeft, MapPin, Shield, Loader2 } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { getEquipmentById } from '../../lib/api';
import { Equipment } from '../context/AppContext';

export const EquipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [pickupLocation, setPickupLocation] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getEquipmentById(id)
      .then(eq => {
        setEquipment(eq);
        setPickupLocation(eq.pickup_location || '');
      })
      .catch(err => setError(err.message || 'Equipment not found'))
      .finally(() => setLoading(false));
  }, [id]);

  const today = new Date().toISOString().split('T')[0];

  const calculateTotal = () => {
    if (!startDate || !endDate || !equipment) return 0;
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    // price is hourly rate; charge per day (24h)
    return days > 0 ? +(days * equipment.price * 24).toFixed(2) : 0;
  };

  const handlePayment = () => {
    if (!startDate || !endDate) { alert('Please select rental dates'); return; }
    navigate('/payment', {
      state: {
        equipment,
        startDate: new Date(startDate).toISOString(),
        endDate:   new Date(endDate).toISOString(),
        totalPrice: calculateTotal(),
        pickupLocation,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
        <span className="text-gray-600">Loading equipment...</span>
      </div>
    );
  }

  if (error || !equipment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">{error || 'Equipment not found'}</h2>
          <Button onClick={() => navigate('/marketplace')}>Back to Marketplace</Button>
        </div>
      </div>
    );
  }

  const totalPrice = calculateTotal();
  const rentalDays = startDate && endDate ? differenceInDays(new Date(endDate), new Date(startDate)) + 1 : 0;

  const placeholderImg = `https://placehold.co/600x400?text=${encodeURIComponent(equipment.name)}`;
  const displayImages = equipment.images.length > 0 ? equipment.images : [placeholderImg];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Button variant="ghost" onClick={() => navigate('/marketplace')} className="mb-6 gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Marketplace
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Images */}
          <div>
            <div className="aspect-square rounded-lg overflow-hidden mb-4 bg-gray-100">
              <img
                src={displayImages[selectedImage]}
                alt={equipment.name}
                className="w-full h-full object-cover"
              />
            </div>
            {displayImages.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {displayImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSelectedImage(idx)}
                    className={`aspect-square rounded-md overflow-hidden border-2 ${
                      selectedImage === idx ? 'border-blue-600' : 'border-transparent'
                    }`}
                  >
                    <img src={img} alt={`${equipment.name} ${idx + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div>
            <div className="bg-white rounded-lg p-6 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-3xl mb-2">{equipment.name}</h1>
                  <p className="text-gray-600">{equipment.category}</p>
                </div>
                <Badge variant={equipment.available ? 'default' : 'secondary'}>
                  {equipment.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>

              <div className="mb-6">
                <div className="text-3xl text-blue-600 mb-2">
                  ${equipment.price.toFixed(2)}
                  <span className="text-lg text-gray-600">/hr</span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-gray-700">{equipment.description}</p>
              </div>

              <div className="mb-6 pb-6 border-b">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <MapPin className="w-4 h-4" />
                  <span>Pickup: {pickupLocation || 'See pickup location below'}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="w-4 h-4" />
                  <span>Damage protection included</span>
                </div>
              </div>

              {/* Pickup Location */}
              <div className="mb-6">
                <Label htmlFor="pickupLocation" className="font-semibold text-base mb-2 block">
                  Confirm Pickup Location
                </Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    id="pickupLocation"
                    placeholder="e.g. SMU SOE Level 3, Block A Lobby..."
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Date Selection */}
              {equipment.available ? (
                <div className="mb-6">
                  <h3 className="font-semibold mb-4">Select Rental Period</h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label htmlFor="startDate" className="text-sm text-gray-600 mb-1 block">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        min={today}
                        value={startDate}
                        onChange={(e) => {
                          setStartDate(e.target.value);
                          if (endDate && e.target.value > endDate) setEndDate('');
                        }}
                      />
                    </div>
                    <div>
                      <Label htmlFor="endDate" className="text-sm text-gray-600 mb-1 block">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        min={startDate || today}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        disabled={!startDate}
                      />
                    </div>
                  </div>

                  {startDate && endDate && rentalDays > 0 && (
                    <Card className="bg-blue-50 border-blue-200">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm text-gray-600">
                              {rentalDays} {rentalDays === 1 ? 'day' : 'days'} × ${equipment.price.toFixed(2)}/hr × 24h
                            </p>
                            <p className="text-2xl font-semibold text-blue-600">${totalPrice.toFixed(2)}</p>
                          </div>
                          <Button size="lg" onClick={handlePayment}>
                            Proceed to Payment
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-4 text-center text-gray-500">
                  This equipment is currently unavailable for rental.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
