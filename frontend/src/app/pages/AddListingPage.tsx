import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { categories } from '../data/mockEquipment';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { ChevronLeft, Upload } from 'lucide-react';

const CONDITIONS = ['Excellent', 'Good', 'Fair', 'Poor'];

// Placeholder images per category for the mock
const PLACEHOLDER_IMAGES: Record<string, string> = {
  'Cameras': 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800',
  'Power Tools': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800',
  'Camping Gear': 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=800',
  'Sports Equipment': 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800',
  'Electronics': 'https://images.unsplash.com/photo-1550009158-9ebf69173e03?w=800',
  'Musical Instruments': 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=800',
};
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800';

export const AddListingPage: React.FC = () => {
  const navigate = useNavigate();
  const { addListing } = useApp();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('');
  const [imageFileName, setImageFileName] = useState('');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImageFileName(file.name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid daily rate.');
      return;
    }

    const image = PLACEHOLDER_IMAGES[category] ?? DEFAULT_IMAGE;

    addListing({
      name,
      description,
      category,
      price: parsedPrice,
      condition,
      images: [image],
      available: true,
    });

    navigate('/my-listings');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/my-listings')}
          className="mb-6 gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to My Listings
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Add New Listing</CardTitle>
            <p className="text-sm text-gray-600">List your equipment for others to rent</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Equipment Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g. Canon EOS 5D Mark IV"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe your equipment, what's included, any accessories..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={category} onValueChange={setCategory} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Condition *</Label>
                  <Select value={condition} onValueChange={setCondition} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select condition" />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">Daily Rate (SGD) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <Input
                    id="price"
                    type="number"
                    min="1"
                    step="0.50"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="pl-8"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Photos</Label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    id="photo-upload"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="hidden"
                  />
                  <label htmlFor="photo-upload" className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    {imageFileName ? (
                      <p className="text-sm text-blue-600">{imageFileName}</p>
                    ) : (
                      <>
                        <p className="text-sm text-gray-600">Click to upload photos</p>
                        <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 10MB</p>
                      </>
                    )}
                  </label>
                </div>
                <p className="text-xs text-gray-500">
                  A placeholder image will be used for the demo if no photo is uploaded.
                </p>
              </div>

              <div className="flex gap-4 pt-2">
                <Button type="submit" className="flex-1" size="lg">
                  Publish Listing
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/my-listings')}
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
