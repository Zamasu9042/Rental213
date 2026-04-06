import { createBrowserRouter, Navigate } from 'react-router';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { MarketplacePage } from './pages/MarketplacePage';
import { EquipmentDetailPage } from './pages/EquipmentDetailPage';
import { PaymentPage } from './pages/PaymentPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import { AccountPage } from './pages/AccountPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { ListingDetailPage } from './pages/ListingDetailPage';
import { DamageClaimPage } from './pages/DamageClaimPage';
import { DamageClaimResultPage } from './pages/DamageClaimResultPage';
import { StaffDashboardPage } from './pages/StaffDashboardPage';
import { AccountLimitedPage } from './pages/AccountLimitedPage';
import { ReviewPage } from './pages/ReviewPage';
import { AddListingPage } from './pages/AddListingPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RootLayout } from './components/RootLayout';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'marketplace',
        element: <MarketplacePage />,
      },
      {
        path: 'equipment/:id',
        element: <EquipmentDetailPage />,
      },
      {
        path: 'payment',
        element: <PaymentPage />,
      },
      {
        path: 'confirmation',
        element: <ConfirmationPage />,
      },
      {
        path: 'my-rentals',
        element: <ConfirmationPage />,
      },
      {
        path: 'account',
        element: <AccountPage />,
      },
      {
        path: 'my-listings',
        element: <MyListingsPage />,
      },
      {
        path: 'listing/:id',
        element: <ListingDetailPage />,
      },
      {
        path: 'add-listing',
        element: <AddListingPage />,
      },
      {
        path: 'damage-claim/:rentalId',
        element: <DamageClaimPage />,
      },
      {
        path: 'damage-claim-result/:claimId',
        element: <DamageClaimResultPage />,
      },
      {
        path: 'review/:rentalId',
        element: <ReviewPage />,
      },
      {
        path: 'staff-dashboard',
        element: <StaffDashboardPage />,
      },
      {
        path: 'account-limited',
        element: <AccountLimitedPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
