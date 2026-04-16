import React, { memo, type KeyboardEvent } from 'react';
import type { SeatData } from '../types.js';

type SeatProps = {
  seat: SeatData;
  selected: boolean;
  disabled: boolean;
  fill: string;
  stroke: string;
  updated: boolean;
  onToggle: (seat: SeatData) => void;
  onArrowNavigate: (seat: SeatData, direction: string) => void;
  onHighlight: (seat: SeatData | null) => void;
};

const SeatComponent = ({
  seat,
  selected,
  disabled,
  fill,
  stroke,
  updated,
  onToggle,
  onArrowNavigate,
  onHighlight,
}: SeatProps) => {
  const label = `${seat.section} Row ${seat.row}, Seat ${seat.number}, ${seat.status}, $${seat.price}`;

  const handleKeyDown = (event: KeyboardEvent<SVGRectElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!disabled) onToggle(seat);
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      onArrowNavigate(seat, event.key);
    }
  };

  return (
    <g className="seat-group">
      <rect
        id={`seat-${seat.id}`}
        x={seat.x}
        y={seat.y}
        width={seat.width}
        height={seat.height}
        rx={3}
        ry={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected ? 2 : 1}
        opacity={disabled ? 0.5 : 1}
        tabIndex={0}
        role="button"
        aria-label={label}
        aria-pressed={selected}
        aria-disabled={disabled}
        onClick={() => !disabled && onToggle(seat)}
        onKeyDown={handleKeyDown}
        onFocus={() => onHighlight(seat)}
        onBlur={() => onHighlight(null)}
        className={`seat ${selected ? 'seat-selected' : ''} ${disabled ? 'seat-disabled' : 'seat-available'} ${updated ? 'seat-updated' : ''}`}
      />
      <title>{label}</title>
    </g>
  );
};

export const Seat = memo(SeatComponent, (prevProps, nextProps) => {
  return (
    prevProps.seat === nextProps.seat &&
    prevProps.selected === nextProps.selected &&
    prevProps.disabled === nextProps.disabled &&
    prevProps.fill === nextProps.fill &&
    prevProps.stroke === nextProps.stroke &&
    prevProps.updated === nextProps.updated &&
    prevProps.onToggle === nextProps.onToggle &&
    prevProps.onArrowNavigate === nextProps.onArrowNavigate &&
    prevProps.onHighlight === nextProps.onHighlight
  );
});
