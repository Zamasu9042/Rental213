import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { AlertTriangle, CreditCard, CheckCircle, Lock } from 'lucide-react';

export const AccountLimitedPage: React.FC = () => {
  const { user, payFees } = useApp();
  const navigate = useNavigate();

  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paid, setPaid] = useState(false);
  const [cardNumber, setCardNumber] = useState('');
  const [cardName, setCardName] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');

  const unpaidFees = [
    {
      id: '1',
      equipmentName: 'Late return fee',
      dueDate: new Date().toISOString(),
      amount: user?.unpaidAmount ?? 0,
      reason: 'Late return',
    },
  ].filter(f => f.amount > 0);

  const displayFees = unpaidFees.length > 0 ? unpaidFees : [
    { id: '1', equipmentName: 'Mountain Bike', dueDate: '2026-03-15', amount: 180, reason: 'Late return (3 days)' },
    { id: '2', equipmentName: 'Professional Drill Set', dueDate: '2026-03-10', amount: 75, reason: 'Late return (1 day)' },
  ];

  const totalOwed = displayFees.reduce((sum, fee) => sum + fee.amount, 0);

  const handlePaySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    payFees();
    setPaid(true);
    setTimeout(() => navigate('/'), 2000);
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl mb-2">Payment Successful!</h1>
            <p className="text-gray-600">Your account has been reactivated. Redirecting you home...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="max-w-2xl w-full">
        <CardContent className="p-8">
          {!showPaymentForm ? (
            <>
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <h1 className="text-3xl mb-2">Account Limited</h1>
                <p className="text-gray-600">
                  Your account has been restricted due to unpaid fees from late rental returns.
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-red-900 mb-4">Outstanding Fees</h3>
                <div className="space-y-3">
                  {displayFees.map((fee) => (
                    <div key={fee.id} className="bg-white rounded p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold">{fee.equipmentName}</p>
                          <p className="text-sm text-gray-600">{fee.reason}</p>
                          <p className="text-xs text-gray-500">Due: {new Date(fee.dueDate).toLocaleDateString()}</p>
                        </div>
                        <p className="text-lg font-bold text-red-600">${fee.amount}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-red-200 mt-4 pt-4 flex justify-between items-center">
                  <span className="font-semibold">Total Amount Due:</span>
                  <span className="text-2xl font-bold text-red-600">${totalOwed}</span>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-3">What you can't do until fees are paid:</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                    Rent new equipment
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                    List new items for rent
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                    Access marketplace features
                  </li>
                </ul>
              </div>

              <Button
                className="w-full mb-3 gap-2"
                size="lg"
                onClick={() => setShowPaymentForm(true)}
              >
                <CreditCard className="w-5 h-5" />
                Pay ${totalOwed} Now
              </Button>

              <p className="text-sm text-gray-600 text-center">
                Questions? Contact our support team at support@equipshare.com
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setShowPaymentForm(false)} className="text-gray-500 hover:text-gray-700 text-sm">
                  ← Back
                </button>
                <h1 className="text-2xl">Pay Outstanding Fees</h1>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-6 flex justify-between items-center">
                <span className="text-gray-600">Total to pay</span>
                <span className="text-2xl font-bold text-red-600">${totalOwed}</span>
              </div>

              <form onSubmit={handlePaySubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cardNumber">Card Number</Label>
                  <Input
                    id="cardNumber"
                    placeholder="1234 5678 9012 3456"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    maxLength={19}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="cardName">Name on Card</Label>
                  <Input
                    id="cardName"
                    placeholder="John Doe"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="expiry">Expiry Date</Label>
                    <Input
                      id="expiry"
                      placeholder="MM/YY"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      maxLength={5}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cvv">CVV</Label>
                    <Input
                      id="cvv"
                      placeholder="123"
                      type="password"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      maxLength={4}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded">
                  <Lock className="w-4 h-4" />
                  <span>Your payment information is secure and encrypted</span>
                </div>

                <Button type="submit" className="w-full" size="lg">
                  Pay ${totalOwed} & Reactivate Account
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
