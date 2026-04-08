import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useApp } from '../context/AppContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useApp();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email.trim(), password);
      // RootLayout handles role-based redirect; staff goes to /staff-dashboard automatically
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (e: string, p: string) => { setEmail(e); setPassword(p); };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-3xl">EquipShare</CardTitle>
          <CardDescription>
            Sign in to rent or list your equipment
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : 'Sign In'}
            </Button>

            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 text-xs text-gray-600 space-y-3">
              <p className="font-semibold">Test accounts (click a row to fill email and password)</p>
              {[
                { label: 'Renter', email: 'renter@test.com', password: 'password123' },
                { label: 'Renter 2', email: 'renter2check@gmail.com', password: 'password123' },
                { label: 'Owner', email: 'owner@test.com', password: 'password123' },
                { label: 'Staff', email: 'staff@test.com', password: 'password123' },
              ].map(({ label, email: e, password: p }) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => fillCredentials(e, p)}
                  className="w-full text-left hover:bg-gray-100 rounded px-2 py-2 transition-colors border border-transparent hover:border-gray-200"
                >
                  <span className="font-medium text-gray-800 block mb-1">{label}</span>
                  <span className="text-gray-500">Email: </span>
                  <span className="font-mono text-gray-800">{e}</span>
                  <br />
                  <span className="text-gray-500">Password: </span>
                  <span className="font-mono text-gray-800">{p}</span>
                </button>
              ))}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
