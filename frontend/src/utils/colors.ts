import { SeatStatus } from '../types.js';

export const getPriceTierColor = (price: number) => {
  if (price >= 250) return 'var(--price-tier-4)';
  if (price >= 210) return 'var(--price-tier-3)';
  if (price >= 180) return 'var(--price-tier-2)';
  return 'var(--price-tier-1)';
};

export const getStatusColor = (status: SeatStatus) => {
  switch (status) {
    case 'reserved':
      return 'var(--seat-reserved)';
    case 'sold':
      return 'var(--seat-sold)';
    case 'held':
      return 'var(--seat-held)';
    default:
      return 'var(--seat-available)';
  }
};
