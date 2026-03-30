import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Home, Search, User, Package, LogOut } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/button';

export const Header: React.FC = () => {
  const { user, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  if (!user || location.pathname === '/login') {
    return null;
  }

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-xl font-semibold text-gray-900">
              EquipShare
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link 
                to="/" 
                className={`flex items-center gap-2 text-sm ${isActive('/') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Home className="w-4 h-4" />
                Home
              </Link>
              <Link 
                to="/marketplace" 
                className={`flex items-center gap-2 text-sm ${isActive('/marketplace') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Search className="w-4 h-4" />
                Marketplace
              </Link>
              <Link 
                to="/my-listings" 
                className={`flex items-center gap-2 text-sm ${isActive('/my-listings') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
              >
                <Package className="w-4 h-4" />
                My Listings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">
              {user.name}
            </span>
            <Link to="/account">
              <Button variant="ghost" size="sm">
                <User className="w-4 h-4" />
              </Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
