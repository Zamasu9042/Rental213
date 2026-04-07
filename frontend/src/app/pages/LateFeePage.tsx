/**
 * LateFeePage.tsx — Scenario 2 late fee payment flow
 *
 * Entry points:
 *   A) From return-workflow (ConfirmationPage) — navigation state carries paymentId + lateFee
 *      → Skip the GET fetch; show amount immediately, user clicks Pay.
 *   B) From My Rentals "Pay late fee" button (returning user, LATE rental)
 *      → GET /api/payment/rental/:id/late-fee to load existing unpaid payment.
 *      → If 404 (payment not yet recorded), fall back to POST /api/payment/outstanding.
 *
 * Pay button:
 *   POST /api/payment/outstanding/:paymentId/checkout → Stripe URL → redirect
 *
 * After Stripe payment:
 *   Stripe webhook → payment-service (marks PAID) → camunda-proxy /internal/late-payment-confirmed
 *   Camunda: deducts reputation, marks rental COMPLETED, publishes RabbitMQ → SMS via notification-service
 *
 * Stripe redirects to: /confirmation?rental_id=X&payment_id=Y
 */

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ChevronLeft, Loader2, CreditCard, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import {
  getLateFeePayment,
  recordOutstandingLateFee,
  checkoutOutstandingLateFee,
  ApiPayment,
} from '../../lib/api';

type PageState = 'loading' | 'ready' | 'paying' | 'already-paid' | 'error';

interface NavState {
  paymentId?: number;
  lateFee?: number;
}

export const LateFeePage: React.FC = () => {
  const { rentalId } = useParams<{ rentalId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [payment, setPayment] = useState<ApiPayment | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!rentalId) { navigate('/my-rentals'); return; }

    const navState = (location.state ?? {}) as NavState;

    (async () => {
      try {
        let resolved: ApiPayment | null = null;

        // Try GET first (returns existing unpaid row).
        // Fall back to POST /outstanding for any failure — handles both:
        //   • Old container not yet rebuilt (route doesn't exist → "Not Found")
        //   • No payment record yet (404 "No unpaid late fee for this rental")
        // POST /outstanding is idempotent: returns existing dup if one exists,
        // or creates a new one if the rental is LATE/RETURNED.
        try {
          resolved = await getLateFeePayment(Number(rentalId));
        } catch {
          resolved = await recordOutstandingLateFee(Number(rentalId));
        }

        if (!resolved) throw new Error('Could not load late fee details.');

        // If payment is already paid, the rental is being completed asynchronously
        if (resolved.status === 'paid') {
          setPageState('already-paid');
          return;
        }

        setPayment(resolved);
        setPageState('ready');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load late fee details.';
        setErrorMessage(msg);
        setPageState('error');
      }
    })();
  }, [rentalId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePay = async () => {
    if (!payment) return;
    setPageState('paying');
    try {
      const result = await checkoutOutstandingLateFee(payment.paymentID);
      window.location.href = result.checkout_url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start payment. Please try again.';
      setErrorMessage(msg);
      setPageState('error');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate('/my-rentals?filter=payment-due')}
          className="mb-6 gap-2"
          disabled={pageState === 'paying'}
        >
          <ChevronLeft className="w-4 h-4" />
          Back to My Rentals
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-red-500" />
              Late Return Fee
            </CardTitle>
            <p className="text-sm text-gray-500 mt-1">Rental #{rentalId}</p>
          </CardHeader>
          <CardContent className="space-y-6">

            {pageState === 'loading' && (
              <div className="flex items-center justify-center py-12 gap-3 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Loading late fee details...</span>
              </div>
            )}

            {pageState === 'ready' && payment && (
              <>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Rental ID</span>
                    <span className="font-mono">#{payment.rentalID}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Fee type</span>
                    <span className="capitalize">{payment.type} fee</span>
                  </div>
                  <div className="flex justify-between text-lg font-semibold border-t border-red-200 pt-3">
                    <span>Amount Due</span>
                    <span className="text-red-600">${Number(payment.amount).toFixed(2)}</span>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <p className="font-semibold mb-1">Why am I being charged?</p>
                  <p>
                    The equipment was returned after the agreed end date. Late fees are
                    calculated based on the hourly rate for each hour overdue (minimum 1 hour).
                  </p>
                </div>

                <Button
                  className="w-full gap-2"
                  size="lg"
                  onClick={handlePay}
                >
                  <CreditCard className="w-4 h-4" />
                  Pay ${Number(payment.amount).toFixed(2)} Now
                </Button>
              </>
            )}

            {pageState === 'paying' && (
              <div className="text-center py-12">
                <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="font-semibold">Redirecting to Stripe...</p>
                <p className="text-sm text-gray-500 mt-2">Please wait</p>
              </div>
            )}

            {pageState === 'already-paid' && (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-emerald-800">Late fee already paid</p>
                    <p className="text-sm text-emerald-700 mt-1">
                      Your payment has been received. Your rental is being marked as completed —
                      you'll receive a confirmation SMS shortly.
                    </p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => navigate('/my-rentals')}>
                  View My Rentals
                </Button>
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
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate('/my-rentals?filter=payment-due')}
                >
                  Back to My Rentals
                </Button>
              </div>
            )}

          </CardContent>
        </Card>
      </div>
    </div>
  );
};
