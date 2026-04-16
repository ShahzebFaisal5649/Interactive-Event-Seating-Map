import React, { memo, useEffect, useRef, useCallback } from 'react';
import { getPriceTierColor, getStatusColor } from '../utils/colors.js';
import type { SeatData, SeatStatus, SectionView } from '../types.js';

type SeatMapProps = {
  sections: SectionView[];
  selectedIdSet: Set<string>;
  liveStatusMap: Record<string, SeatStatus>;
  heatMapEnabled: boolean;
  updatedSeatIdSet: Set<string>;
  onToggle: (seat: SeatData) => void;
  onHighlight: (seat: SeatData | null) => void;
};

// Canvas drawing constants
const SEAT_RADIUS = 3;
const SEAT_GAP = 2;

export const SeatMap = memo(function SeatMap({
  sections,
  selectedIdSet,
  liveStatusMap,
  heatMapEnabled,
  updatedSeatIdSet,
  onToggle,
  onHighlight,
}: SeatMapProps) {
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const spatialGrids = useRef<Record<string, { grid: Record<string, SeatData[]>; gridSize: number }>>({});

  // Initialize spatial grids for hit detection
  useEffect(() => {
    const GRID_SIZE = 40;
    sections.forEach(({ section, seats }) => {
      const grid: Record<string, SeatData[]> = {};
      seats.forEach(seat => {
        const gx = Math.floor(seat.x / GRID_SIZE);
        const gy = Math.floor(seat.y / GRID_SIZE);
        const key = `${gx},${gy}`;
        if (!grid[key]) grid[key] = [];
        grid[key].push(seat);
      });
      spatialGrids.current[section.id] = { grid, gridSize: GRID_SIZE };
    });
  }, [sections]);

  // Drawing logic
  const drawSection = useCallback((section: SectionView, ctx: CanvasRenderingContext2D, dpr: number) => {
    ctx.clearRect(0, 0, section.width * dpr, section.height * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    section.seats.forEach(seat => {
      const status = liveStatusMap[seat.id] ?? seat.status;
      const selected = selectedIdSet.has(seat.id);
      const updated = updatedSeatIdSet.has(seat.id);
      
      const fill = heatMapEnabled && status === 'available'
        ? getPriceTierColor(seat.price)
        : getStatusColor(status);
 
      if (seat.id === 'A-1-1') {
        // Log one seat to verify color resolution in production
        console.debug('Seat A-1-1 Debug:', { status, fill, heatMapEnabled, selected });
      }

      ctx.beginPath();
      // Draw rounded rectangle for seat
      const x = seat.x;
      const y = seat.y;
      const w = seat.width;
      const h = seat.height;
      const r = 3; // Slightly more rounded

      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();

      if (selected || updated) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#0891b2'; // Cyan shadow
      } else {
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = fill;
      ctx.globalAlpha = status !== 'available' ? 0.35 : 1.0; // Slightly more dimmed non-available
      ctx.fill();

      if (selected) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff'; // Direct white
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      if (updated) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#06b6d4'; // Direct cyan
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      // Reset shadow for next seat
      ctx.shadowBlur = 0;
    });
    ctx.restore();
  }, [liveStatusMap, selectedIdSet, updatedSeatIdSet, heatMapEnabled]);

  // Trigger redraw on changes
  useEffect(() => {
    sections.forEach(section => {
      const canvas = canvasRefs.current[section.section.id];
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      drawSection(section, ctx, dpr);
    });
  }, [sections, drawSection, liveStatusMap, selectedIdSet, updatedSeatIdSet, heatMapEnabled]);

  const handleInteraction = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    section: SectionView,
    type: 'click' | 'hover'
  ) => {
    const canvas = canvasRefs.current[section.section.id];
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      if (type === 'click' && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
      } else if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else return;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (section.width / rect.width);
    const y = (clientY - rect.top) * (section.height / rect.height);

    const spatialIndex = spatialGrids.current[section.section.id];
    if (!spatialIndex) return;

    const gx = Math.floor(x / spatialIndex.gridSize);
    const gy = Math.floor(y / spatialIndex.gridSize);
    
    // Check nearby cells to be safe
    let foundSeat: SeatData | null = null;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = spatialIndex.grid[`${gx + dx},${gy + dy}`];
        if (cell) {
          const matched = cell.find(s => 
            x >= s.x && x <= s.x + s.width && 
            y >= s.y && y <= s.y + s.height
          );
          if (matched) {
            foundSeat = matched;
            break;
          }
        }
      }
      if (foundSeat) break;
    }

    if (type === 'click') {
      if (foundSeat) onToggle(foundSeat);
    } else {
      onHighlight(foundSeat);
    }
  };

  return (
    <>
      {sections.map((sectionView) => {
        const { section, width, height } = sectionView;
        const dpr = window.devicePixelRatio || 1;
        
        return (
          <div 
            key={section.id} 
            className="section-card"
          >
            <div className="section-head">
              <div>
                <strong>{section.label}</strong>
                <span>{section.rows} rows · {section.seatsPerRow} seats / row</span>
              </div>
              <span className="section-pill">Section {section.id}</span>
            </div>
            <div className="canvas-container" style={{ position: 'relative', width: '100%', height: 'auto' }}>
              <canvas
                ref={el => canvasRefs.current[section.id] = el}
                width={width * dpr}
                height={height * dpr}
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '12px' }}
                onClick={(e) => handleInteraction(e, sectionView, 'click')}
                onMouseMove={(e) => handleInteraction(e, sectionView, 'hover')}
                onMouseLeave={() => onHighlight(null)}
              />
            </div>
          </div>
        );
      })}
    </>
  );
});


