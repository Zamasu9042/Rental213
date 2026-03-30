import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { useApp } from '../context/AppContext';
import { Header } from './Header';

export const RootLayout: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!user && location.pathname !== '/login') {
      navigate('/login');
    }

    // Check if user has unpaid fees and redirect to limited page
    if (user?.hasUnpaidFees && location.pathname !== '/account-limited') {
      navigate('/account-limited');
    }
  }, [user, navigate, location.pathname]);

  if (!user) {
    return null;
  }

  return (
    <div>
      <Header />
      <Outlet />
    </div>
  );
};
