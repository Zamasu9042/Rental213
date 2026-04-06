import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { User, Mail, Phone, MapPin } from 'lucide-react';

export const AccountPage: React.FC = () => {
  const { user } = useApp();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '(555) 123-4567');
  const [address, setAddress] = useState('123 Main St, City, State 12345');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Profile updated successfully!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl mb-8">Account Settings</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Profile Picture */}
          <div>
            <Card>
              <CardContent className="p-6 text-center">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <User className="w-16 h-16 text-white" />
                </div>
                <h3 className="font-semibold text-lg">{user?.name}</h3>
                <p className="text-sm text-gray-600">{user?.email}</p>
                <Button variant="outline" size="sm" className="mt-4">
                  Change Photo
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="p-6">
                <h4 className="font-semibold mb-2">Account Status</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Member Since</span>
                    <span>Jan 2024</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Rentals</span>
                    <span>12</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Rating</span>
                    <span>⭐ 4.8</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Profile Form */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <Input
                        id="address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-semibold mb-4">Notification Preferences</h4>
                    <div className="space-y-3">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span className="text-sm">Email notifications for new rentals</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" defaultChecked className="rounded" />
                        <span className="text-sm">Rental reminders</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="rounded" />
                        <span className="text-sm">Marketing emails</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <Button type="submit" className="flex-1">
                      Save Changes
                    </Button>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </div>
                </form>

                {/* Demo Link */}
                <div className="mt-6 pt-6 border-t">
                  <p className="text-xs text-gray-500 mb-2">Demo Features:</p>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="sm"
                    onClick={() => navigate('/account-limited')}
                    className="text-xs"
                  >
                    View Account Limited Screen (Demo)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};