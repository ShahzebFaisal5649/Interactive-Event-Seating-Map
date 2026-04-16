export type SeatStatus = 'available' | 'reserved' | 'sold' | 'held';

export type VenueSection = {
  id: string;
  label: string;
  x: number;
  y: number;
  rows: number;
  seatsPerRow: number;
  rowSpacing: number;
  seatSpacing: number;
  priceBase: number;
};

export type VenueDefinition = {
  map: {
    width: number;
    height: number;
  };
  sections: VenueSection[];
};

export type SeatData = {
  id: string;
  section: string;
  sectionIndex: number;
  sectionLabel: string;
  row: number;
  number: number;
  price: number;
  status: SeatStatus;
  x: number;
  y: number;
  width: number;
  height: number;
};
