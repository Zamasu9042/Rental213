/**
 * EquipShare - Equipment Rental Marketplace
 * 
 * A comprehensive platform for renting and borrowing equipment.
 * Features:
 * - User authentication and account management
 * - Browse and search equipment marketplace
 * - Rent equipment with date selection and payment
 * - List equipment for rental
 * - Damage claim system with photo uploads
 * - Account restrictions for unpaid fees
 */

import { RouterProvider } from 'react-router';
import { AppProvider } from './context/AppContext';
import { router } from './routes';

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  );
}