import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router';
import { Home, Search, User, Package, LogOut, ShieldCheck, ClipboardList } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';

const ROLE_BADGE: Record<string, string> = {
  renter: 'Renter',
  owner: 'Owner',
  staff: 'Staff',
};

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

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-xl font-semibold text-gray-900">
              EquipShare
            </Link>

            <nav className="hidden md:flex gap-6">
              {/* ── Renter nav ── */}
              {user.role === 'renter' && (
                <>
                  <Link
                    to="/"
                    className={`flex items-center gap-2 text-sm ${isActive('/') && location.pathname === '/' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
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
                    to="/my-rentals"
                    className={`flex items-center gap-2 text-sm ${isActive('/my-rentals') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <ClipboardList className="w-4 h-4" />
                    My Rentals
                  </Link>
                </>
              )}

              {/* ── Owner nav ── */}
              {user.role === 'owner' && (
                <>
                  <Link
                    to="/"
                    className={`flex items-center gap-2 text-sm ${location.pathname === '/' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <Home className="w-4 h-4" />
                    Home
                  </Link>
                  <Link
                    to="/my-listings"
                    className={`flex items-center gap-2 text-sm ${isActive('/my-listings') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    <Package className="w-4 h-4" />
                    My Listings
                  </Link>
                </>
              )}

              {/* ── Staff nav ── */}
              {user.role === 'staff' && (
                <Link
                  to="/staff-dashboard"
                  className={`flex items-center gap-2 text-sm ${isActive('/staff-dashboard') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Damage Claims
                </Link>
              )}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="hidden sm:inline-flex text-xs">
              {ROLE_BADGE[user.role] ?? user.role}
            </Badge>
            <span className="text-sm text-gray-600 hidden sm:block">{user.name}</span>
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
