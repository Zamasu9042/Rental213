import React from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { featuredEquipment, categories } from '../data/mockEquipment';
import { EquipmentCard } from '../components/EquipmentCard';
import { Button } from '../components/ui/button';
import { ArrowRight } from 'lucide-react';

export const HomePage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl mb-4">
            Welcome back, {user?.name}! 👋
          </h1>
          <p className="text-xl text-blue-100 max-w-2xl">
            Discover thousands of equipment rentals in your area. From power tools to cameras, find everything you need.
          </p>
        </div>
      </section>

      {/* Categories Section */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <h2 className="text-2xl mb-6">Browse by Category</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((category) => (
            <Button
              key={category}
              variant="outline"
              className="h-24 text-base hover:bg-blue-50 hover:border-blue-300"
              onClick={() => navigate(`/marketplace?category=${encodeURIComponent(category)}`)}
            >
              {category}
            </Button>
          ))}
        </div>
      </section>

      {/* Featured Items */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl">Featured Equipment</h2>
          <Button 
            variant="ghost" 
            onClick={() => navigate('/marketplace')}
            className="gap-2"
          >
            View All
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredEquipment.map((equipment) => (
            <EquipmentCard
              key={equipment.id}
              equipment={equipment}
              onClick={() => navigate(`/equipment/${equipment.id}`)}
            />
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-8 md:p-12 text-white text-center">
          <h2 className="text-3xl mb-4">Have equipment to rent out?</h2>
          <p className="text-lg text-indigo-100 mb-6 max-w-2xl mx-auto">
            Turn your idle equipment into income. List your items and start earning today.
          </p>
          <Button 
            size="lg" 
            variant="secondary"
            onClick={() => navigate('/my-listings')}
          >
            View My Listings
          </Button>
        </div>
      </section>
    </div>
  );
};
