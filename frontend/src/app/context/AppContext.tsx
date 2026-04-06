import React, { createContext, useContext, useState, ReactNode } from 'react';
import { loginUser } from '../../lib/api';

export interface Equipment {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  condition: string;
  images: string[];
  ownerId: string;
  ownerName: string;
  available: boolean;
  pickup_location?: string;
}

export interface Rental {
  id: string;
  equipmentId: string;
  equipment: Equipment;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: 'active' | 'pending-return' | 'completed' | 'overdue' | 'late';
  pickupLocation?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  hasUnpaidFees: boolean;
  unpaidAmount?: number;
}

export interface Review {
  id: string;
  rentalId: string;
  rating: number;
  comment: string;
  targetType: 'equipment' | 'user';
  targetId: string;
  date: string;
}

export interface DamageClaim {
  id: string;
  equipmentId: string;
  equipmentName: string;
  renterId: string;
  renterName: string;
  images: string[];
  description: string;
  date: string;
  status: 'pending' | 'ai-analyzed' | 'confirmed' | 'rejected';
  aiAnalysis?: {
    damageType: string;
    severity: string;
    confidence: number;
    estimatedCost: number;
  };
}

interface AppContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  rentals: Rental[];
  addRental: (rental: Rental) => void;
  returnRental: (rentalId: string) => void;
  confirmReturn: (rentalId: string) => void;
  markLateReturn: (rentalId: string, feeAmount: number) => void;
  myListings: Equipment[];
  addListing: (equipment: Omit<Equipment, 'id' | 'ownerId' | 'ownerName'>) => void;
  damageClaims: DamageClaim[];
  addDamageClaim: (claim: DamageClaim) => void;
  updateDamageClaim: (claimId: string, updates: Partial<DamageClaim>) => void;
  reviews: Review[];
  addReview: (review: Review) => void;
  payFees: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);


export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [rentals, setRentals] = useState<Rental[]>([]);
  const [damageClaims, setDamageClaims] = useState<DamageClaim[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [myListings, setMyListings] = useState<Equipment[]>([]);

  const login = async (email: string, password: string): Promise<void> => {
    const account = await loginUser(email, password);
    setUser({
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      hasUnpaidFees: false,
    });
    setRentals([]);
    setMyListings([]);
  };

  const logout = () => {
    setUser(null);
    setRentals([]);
    setMyListings([]);
  };

  const addRental = (rental: Rental) => {
    setRentals(prev => [...prev, rental]);
  };

  const returnRental = (rentalId: string) => {
    setRentals(prev =>
      prev.map(r => r.id === rentalId ? { ...r, status: 'pending-return' as const } : r)
    );
  };

  const confirmReturn = (rentalId: string) => {
    const rental = rentals.find(r => r.id === rentalId);
    setRentals(prev =>
      prev.map(r => r.id === rentalId ? { ...r, status: 'completed' as const } : r)
    );
    if (rental) {
      setMyListings(prev =>
        prev.map(l => l.id === rental.equipmentId ? { ...l, available: true } : l)
      );
    }
  };

  const markLateReturn = (rentalId: string, feeAmount: number) => {
    const rental = rentals.find(r => r.id === rentalId);
    setRentals(prev =>
      prev.map(r => r.id === rentalId ? { ...r, status: 'late' as const } : r)
    );
    if (rental) {
      setMyListings(prev =>
        prev.map(l => l.id === rental.equipmentId ? { ...l, available: true } : l)
      );
    }
    setUser(prev => prev ? { ...prev, hasUnpaidFees: true, unpaidAmount: feeAmount } : prev);
  };

  const addListing = (equipment: Omit<Equipment, 'id' | 'ownerId' | 'ownerName'>) => {
    if (!user) return;
    setMyListings(prev => [
      ...prev,
      { ...equipment, id: `listing-${Date.now()}`, ownerId: user.id, ownerName: user.name },
    ]);
  };

  const addDamageClaim = (claim: DamageClaim) => {
    setDamageClaims(prev => [...prev, claim]);
  };

  const updateDamageClaim = (claimId: string, updates: Partial<DamageClaim>) => {
    setDamageClaims(prev =>
      prev.map(c => c.id === claimId ? { ...c, ...updates } : c)
    );
  };

  const addReview = (review: Review) => {
    setReviews(prev => [...prev, review]);
  };

  const payFees = () => {
    setUser(prev => prev ? { ...prev, hasUnpaidFees: false, unpaidAmount: undefined } : prev);
  };

  return (
    <AppContext.Provider value={{
      user, login, logout,
      rentals, addRental, returnRental, confirmReturn, markLateReturn,
      myListings, addListing,
      damageClaims, addDamageClaim, updateDamageClaim,
      reviews, addReview,
      payFees,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
