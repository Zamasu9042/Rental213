import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { mockEquipment } from '../data/mockEquipment';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { differenceInDays } from 'date-fns';
import { ChevronLeft, MapPin, Shield } from 'lucide-react';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export const EquipmentDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const equipment = mockEquipment.find(eq => eq.id === id);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [pickupLocation, setPickupLocation] = useState('');

  if (!equipment) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl mb-4">Equipment not found</h2>
          <Button onClick={() => navigate('/marketplace')}>
            Back to Marketplace
          </Button>
        </div>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];

  const calculateTotal = () => {
    if (!startDate || !endDate) return 0;
    const days = differenceInDays(new Date(endDate), new Date(startDate)) + 1;
    return days > 0 ? days * equipment.price : 0;
  };

  const handlePayment = () => {
    if (!startDate || !endDate) {
      alert('Please select rental dates');
      return;
    }
    navigate('/payment', {
      state: {
        equipment,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(endDate).toISOString(),
        totalPrice: calculateTotal(),
        pickupLocation,
      },
    });
  };

  const totalPrice = calculateTotal();
  const rentalDays = startDate && endDate ? differenceInDays(new Date(endDate), new Date(startDate)) + 1 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/marketplace')}
          className="mb-6 gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Marketplace
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Images */}
          <div>
            <div className="aspect-square rounded-lg overflow-hidden mb-4 bg-gray-100">
              <img
                src={equipment.images[selectedImage]}
                alt={equipment.name}
                className="w-full h-full object-cover"
              />
            </div>
            {equipment.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {equipment.images.map((img, idx) => (
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
                  <p className="text-gray-600">by {equipment.ownerName}</p>
                </div>
                <Badge variant="secondary" className="text-base">
                  {equipment.condition}
                </Badge>
              </div>

              <div className="mb-6">
                <div className="text-3xl text-blue-600 mb-2">
                  ${equipment.price}
                  <span className="text-lg text-gray-600">/day</span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-2">Description</h3>
                <p className="text-gray-700">{equipment.description}</p>
              </div>

              <div className="mb-6 pb-6 border-b">
                <div className="flex items-center gap-2 text-gray-600 mb-2">
                  <MapPin className="w-4 h-4" />
                  <span>Available for pickup or delivery</span>
                </div>
                <div className="flex items-center gap-2 text-gray-600">
                  <Shield className="w-4 h-4" />
                  <span>Damage protection included</span>
                </div>
              </div>

              {/* Pickup Location */}
              <div className="mb-6">
                <Label htmlFor="pickupLocation" className="font-semibold text-base mb-2 block">
                  Pickup Location
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
              <div className="mb-6">
                <h3 className="font-semibold mb-4">Select Rental Period</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <Label htmlFor="startDate" className="text-sm text-gray-600 mb-1 block">
                      Start Date
                    </Label>
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
                    <Label htmlFor="endDate" className="text-sm text-gray-600 mb-1 block">
                      End Date
                    </Label>
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
                          <p className="text-sm text-gray-600">{rentalDays} {rentalDays === 1 ? 'day' : 'days'}</p>
                          <p className="text-2xl font-semibold text-blue-600">${totalPrice}</p>
                        </div>
                        <Button size="lg" onClick={handlePayment}>
                          Proceed to Payment
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
