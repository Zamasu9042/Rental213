/** Shared rental row badges (home, listings, etc.). My Rentals uses workflow-specific labels where needed. */

export type RentalBadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const RENTAL_STATUS_BADGE: Record<
  string,
  { variant: RentalBadgeVariant; label: string }
> = {
  ACTIVE: { variant: 'default', label: 'Active' },
  COLLECTED: { variant: 'default', label: 'Collected' },
  PENDING: { variant: 'outline', label: 'Outstanding payment' },
  RETURNED: { variant: 'secondary', label: 'Returned' },
  COMPLETED: { variant: 'secondary', label: 'Completed' },
  LATE: { variant: 'destructive', label: 'Outstanding payment (late)' },
};
