import { SeatStatus } from '../types.js';

export const getPriceTierColor = (price: number) => {
  // Pricing: A=260, B=220, C=190
  if (price >= 250) return '#ef4444'; // Red - VIP
  if (price >= 210) return '#f59e0b'; // Amber - High
  if (price >= 180) return '#06b6d4'; // Cyan - Mid
  return '#6366f1'; // Indigo - Budget
};

export const getStatusColor = (status: SeatStatus) => {
  switch (status) {
    case 'reserved':
      return '#64748b'; // Slate
    case 'sold':
      return '#f43f5e'; // Rose
    case 'held':
      return '#8b5cf6'; // Violet
    default:
      return '#10b981'; // Emerald
  }
};
