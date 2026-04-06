import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import { Header } from './Header';

// Pages staff are allowed to visit
const STAFF_ALLOWED = ['/staff-dashboard', '/damage-claim-result', '/account'];

export const RootLayout: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!user && location.pathname !== '/login') {
      navigate('/login');
      return;
    }

    if (!user) return;

    // Staff: can only access their dashboard and claim result pages
    if (user.role === 'staff') {
      const allowed = STAFF_ALLOWED.some(p => location.pathname.startsWith(p));
      if (!allowed) navigate('/staff-dashboard');
      return;
    }

    // Renter with unpaid fees
    if (user.role === 'renter' && user.hasUnpaidFees && location.pathname !== '/account-limited') {
      navigate('/account-limited');
    }
  }, [user, navigate, location.pathname]);

  if (!user) return null;

  return (
    <div>
      <Header />
      <Outlet />
    </div>
  );
};
