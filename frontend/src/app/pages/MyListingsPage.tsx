import React from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Package, Plus, Eye } from 'lucide-react';

export const MyListingsPage: React.FC = () => {
  const { myListings } = useApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl mb-2">My Listings</h1>
            <p className="text-gray-600">
              {myListings.length} {myListings.length === 1 ? 'item' : 'items'} listed
            </p>
          </div>
          <Button className="gap-2" onClick={() => navigate('/add-listing')}>
            <Plus className="w-4 h-4" />
            Add New Listing
          </Button>
        </div>

        {myListings.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No listings yet</h3>
              <p className="text-gray-600 mb-4">
                Start earning by listing your equipment
              </p>
              <Button onClick={() => navigate('/add-listing')}>Add Your First Listing</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myListings.map((listing) => (
              <Card key={listing.id} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="aspect-square overflow-hidden">
                    <img 
                      src={listing.images[0]} 
                      alt={listing.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-lg">{listing.name}</h3>
                      <Badge 
                        variant={listing.available ? 'default' : 'secondary'}
                      >
                        {listing.available ? 'Available' : 'Rented'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                      {listing.description}
                    </p>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-lg font-bold text-blue-600">
                        ${listing.price}/day
                      </span>
                      <span className="text-sm text-gray-500">
                        {listing.condition}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2"
                        onClick={() => navigate(`/listing/${listing.id}`)}
                      >
                        <Eye className="w-4 h-4" />
                        View Details
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost"
                      >
                        Edit
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Earnings Summary */}
        {myListings.length > 0 && (
          <Card className="mt-8">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-4">Earnings Summary</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">This Month</p>
                  <p className="text-2xl font-bold text-green-600">$1,240</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Total Earnings</p>
                  <p className="text-2xl font-bold">$8,560</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Active Rentals</p>
                  <p className="text-2xl font-bold">3</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};
