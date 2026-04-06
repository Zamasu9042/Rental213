import React from 'react';
import { Navigate } from 'react-router';

/** Reviews are submitted from My Rentals (modal + reputation API). Legacy route redirects here. */
export const ReviewPage: React.FC = () => (
  <Navigate to="/my-rentals" replace />
);
