import { SeatData, VenueDefinition } from './types.js';

const seatSize = 6;
const seatHeight = 6;

const buildSeatStatus = (row: number, number: number): SeatData['status'] => {
  if (row % 13 === 0 && number % 7 === 0) return 'sold';
  if (row % 10 === 0 && number % 4 === 0) return 'reserved';
  if (row % 15 === 0 && number % 5 === 0) return 'held';
  return 'available';
};

export const buildVenueSeats = (venue: VenueDefinition): SeatData[] => {
  const seats: SeatData[] = [];

  venue.sections.forEach((section: VenueDefinition['sections'][number], sectionIndex: number) => {
    for (let row = 1; row <= section.rows; row += 1) {
      for (let number = 1; number <= section.seatsPerRow; number += 1) {
        const x = (number - 1) * section.seatSpacing;
        const y = (row - 1) * section.rowSpacing;
        const price = Math.max(35, section.priceBase - row * 0.75 + number * 0.08);
        const status = buildSeatStatus(row, number);

        seats.push({
          id: `${section.id}-${row}-${number}`,
          section: section.id,
          sectionLabel: section.label,
          sectionIndex,
          row,
          number,
          price: Math.round(price * 100) / 100,
          status,
          x,
          y,
          width: seatSize,
          height: seatHeight,
        });
      }
    }
  });

  return seats;
};
