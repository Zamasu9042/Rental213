/**
 * PaymentPage.tsx — Scenario 1 payment flow
 *
 * 1. POST /api/rentals → proxy creates PENDING rental + Stripe Checkout Session + starts Camunda
 * 2. Poll /api/rentals/:key/stripe-url every 2 s
 * 3. Redirect to Stripe Hosted Checkout
 * 4. On success Stripe → /confirmation?rental_id=X
 */

import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ChevronLeft, Loader2, CreditCard, AlertCircle } from 'lucide-react';
import { Equipment } from '../context/AppContext';
import { startRentalProcess, pollStripeUrl } from '../../lib/api';

interface LocationState {
  equipment: Equipment;
  startDate: string;
  endDate: string;
  totalPrice: number;
  pickupLocation?: string;
}

type PageState = 'confirm' | 'starting' | 'waiting-stripe' | 'error';

export const PaymentPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useApp();
  const state = location.state as LocationState;

  const [pageState, setPageState] = useState<PageState>('confirm');
  const [errorMessage, setErrorMessage] = useState('');
  const [processKey, setProcessKey] = useState<string | null>(null);

  if (!state) {
    navigate('/marketplace');
    return null;
  }

  const { equipment, startDate, endDate, totalPrice, pickupLocation } = state;

  const handleConfirm = async () => {
    if (!user) { navigate('/login'); return; }

    setPageState('starting');
    setErrorMessage('');

    try {
      // Step 1 — Create rental + Stripe session + start Camunda
      const { processInstanceKey } = await startRentalProcess({
        renterId:       user.id,
        equipmentId:    equipment.id,
        startTime:      startDate,
        endTime:        endDate,
        totalPrice,
        pickUpLocation: pickupLocation || equipment.pickup_location || '',
      });

      setProcessKey(processInstanceKey);
      setPageState('waiting-stripe');

      // Step 2 — Poll for Stripe URL (ready immediately — proxy sets it synchronously)
      const stripeUrl = await pollStripeUrl(processInstanceKey);

      // Step 3 — Redirect to Stripe Hosted Checkout
      window.location.href = stripeUrl;

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      console.error('Payment flow error:', err);
      setErrorMessage(message);
      setPageState('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="mb-6 gap-2"
          disabled={pageState === 'starting' || pageState === 'waiting-stripe'}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Order Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="font-semibold">{equipment.name}</h3>
                <p className="text-sm text-gray-600">{equipment.category}</p>
              </div>

              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Rental Period</span>
                  <span className="text-right text-xs font-mono">
                    {new Date(startDate).toLocaleString()} –{' '}
                    {new Date(endDate).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Hourly Rate</span>
                  <span>${equipment.price.toFixed(2)}/hr</span>
                </div>
                {pickupLocation && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pickup</span>
                    <span className="text-right max-w-[200px]">{pickupLocation}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-semibold pt-2 border-t">
                  <span>Total</span>
                  <span className="text-blue-600">${totalPrice.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Action */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Complete Payment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">

              {pageState === 'confirm' && (
                <>
                  <p className="text-gray-600 text-sm">
                    You'll be redirected to Stripe to complete your payment securely.
                    Your rental will be confirmed once payment is received.
                  </p>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                    <p className="font-semibold mb-1">What happens next:</p>
                    <ol className="space-y-1 list-decimal list-inside">
                      <li>Your rental order is created</li>
                      <li>You're redirected to Stripe to pay</li>
                      <li>You receive a booking confirmation + SMS</li>
                    </ol>
                  </div>
                  <Button className="w-full" size="lg" onClick={handleConfirm}>
                    Confirm &amp; Pay ${totalPrice.toFixed(2)}
                  </Button>
                </>
              )}

              {pageState === 'starting' && (
                <div className="text-center py-8">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                  <p className="font-semibold">Creating your rental order...</p>
                  <p className="text-sm text-gray-500 mt-2">Setting up your booking</p>
                </div>
              )}

              {pageState === 'waiting-stripe' && (
                <div className="text-center py-8">
                  <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                  <p className="font-semibold">Preparing your payment...</p>
                  <p className="text-sm text-gray-500 mt-2">Redirecting you to Stripe shortly</p>
                  {processKey && (
                    <p className="text-xs text-gray-400 mt-4 font-mono">
                      Order ref: {processKey}
                    </p>
                  )}
                </div>
              )}

              {pageState === 'error' && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800">Something went wrong</p>
                      <p className="text-sm text-red-700 mt-1">{errorMessage}</p>
                    </div>
                  </div>
                  <Button className="w-full" variant="outline" onClick={() => setPageState('confirm')}>
                    Try Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};
