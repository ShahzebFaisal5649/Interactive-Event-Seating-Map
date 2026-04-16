import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import venueData from './venue.json';
import { buildVenueSeats } from './utils.js';
import type { SeatData, SeatStatus, SectionView } from './types.js';
import { SeatMap } from './components/SeatMap.js';
import { getSavedSelection, saveSelection } from './utils/storage.js';
import './styles.css';

const MAX_SELECTION = 8;
const DEFAULT_ADJACENT = 2;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function App() {
  const allSeats = useMemo(() => buildVenueSeats(venueData), []);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>(getSavedSelection);
  const [highlightedSeat, setHighlightedSeat] = useState<SeatData | null>(null);
  const [activeSectionId, setActiveSectionId] = useState('A');
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [heatMapEnabled, setHeatMapEnabled] = useState(false);
  const [liveUpdatesEnabled, setLiveUpdatesEnabled] = useState(true);
  const [liveStatusMap, setLiveStatusMap] = useState<Record<string, SeatStatus>>({});
  const [updatedSeatIds, setUpdatedSeatIds] = useState<string[]>([]);
  const [adjacentCount, setAdjacentCount] = useState(DEFAULT_ADJACENT);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const selectedIdsRef = useRef(selectedIds);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const pinchRef = useRef<{ startDistance: number; startZoom: number } | null>(null);
  const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });
  const animationFrameRef = useRef<number | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const applyViewportTransform = useCallback(() => {
    if (!mapContainerRef.current) return;
    const { x, y, zoom } = viewportRef.current;
    mapContainerRef.current.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
  }, []);

  useEffect(() => {
    saveSelection(selectedIds);
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    document.body.className = isDarkMode ? '' : 'light-mode';
  }, [isDarkMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    applyViewportTransform();
  }, [applyViewportTransform]);

  const sections = useMemo<SectionView[]>(() => {
    return venueData.sections.map((section, sectionIndex) => {
      const seats = allSeats.filter((seat) => seat.sectionIndex === sectionIndex);
      const width = section.seatsPerRow * section.seatSpacing + 24;
      const height = section.rows * section.rowSpacing + 24;
      return { section, seats, width, height };
    });
  }, [allSeats]);
 
  const selectedSections = useMemo(() => {
    return sections.filter(s => s.section.id === activeSectionId);
  }, [sections, activeSectionId]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const updatedSeatIdSet = useMemo(() => new Set(updatedSeatIds), [updatedSeatIds]);
  const seatById = useMemo(() => new Map(allSeats.map((seat) => [seat.id, seat])), [allSeats]);

  const selectedSeats = useMemo(
    () => selectedIds.map((id) => seatById.get(id)).filter(Boolean) as SeatData[],
    [selectedIds, seatById],
  );

  const totalSeatCount = allSeats.length;
  const subtotal = useMemo(
    () => selectedSeats.reduce((sum, seat) => sum + seat.price, 0),
    [selectedSeats],
  );

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!liveUpdatesEnabled) return undefined;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.hostname || 'localhost';
    const port = 4000;
    const url = `${protocol}://${host}:${port}/ws`;

    setWsStatus('connecting');
    let reconnectTimer: number | undefined;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setWsStatus('open');
      showToast('Live seat updates connected.', 'success');
    };

    ws.onmessage = ({ data }) => {
      try {
        const payload = JSON.parse(data.toString()) as { type: string; seatId?: unknown; status?: unknown };
        const seatId = payload.seatId;
        const status = payload.status;
        if (
          payload.type === 'seat-update' &&
          typeof seatId === 'string' &&
          (status === 'available' || status === 'reserved' || status === 'sold' || status === 'held')
        ) {
          setLiveStatusMap((prev) => ({ ...prev, [seatId]: status }));
          setUpdatedSeatIds((current) => Array.from(new Set<string>([seatId, ...current])));
          if (selectedIdsRef.current.includes(seatId) && status !== 'available') {
            setSelectedIds((current) => current.filter((id) => id !== seatId));
            showToast(`${seatId} is no longer available. Removed from selection.`, 'warning');
          }
        }
      } catch {
        // ignore invalid payload
      }
    };

    ws.onerror = () => {
      showToast('Live updates connection failed.', 'error');
    };

    ws.onclose = () => {
      setWsStatus('closed');
      showToast('Live updates disconnected.', 'info');
      if (liveUpdatesEnabled) {
        reconnectTimer = window.setTimeout(() => setReconnectAttempt((count) => count + 1), 3000);
      }
    };

    return () => {
      ws.close();
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
    };
  }, [liveUpdatesEnabled, reconnectAttempt, showToast]);

  useEffect(() => {
    if (!updatedSeatIds.length) return;
    const timer = window.setTimeout(() => setUpdatedSeatIds([]), 700);
    return () => window.clearTimeout(timer);
  }, [updatedSeatIds]);

  const findAdjacentSeats = useCallback(
    (count: number) => {
      if (count < 1 || count > MAX_SELECTION) {
        showToast(`Enter a number between 1 and ${MAX_SELECTION}.`, 'info');
        return null;
      }
      if (selectedIds.length + count > MAX_SELECTION) {
        showToast(`You can only select ${MAX_SELECTION} seats total. Remove one first.`, 'error');
        return null;
      }

      for (const section of sections) {
        for (let row = 1; row <= section.section.rows; row += 1) {
          const rowSeats = section.seats
            .filter((seat) => {
              const status = liveStatusMap[seat.id] ?? seat.status;
              return seat.row === row && status === 'available' && !selectedIds.includes(seat.id);
            })
            .sort((a, b) => a.number - b.number);

          let run: string[] = [];
          let previousNumber = 0;

          for (const seat of rowSeats) {
            if (previousNumber && seat.number !== previousNumber + 1) {
              run = [];
            }
            run.push(seat.id);
            previousNumber = seat.number;

            if (run.length === count) {
              return run;
            }
          }
        }
      }

      showToast(`Could not find ${count} adjacent seats.`, 'warning');
      return null;
    },
    [sections, selectedIds, showToast, liveStatusMap],
  );

  const handleFindAdjacent = useCallback(() => {
    const seats = findAdjacentSeats(adjacentCount);
    if (seats?.length) {
      setSelectedIds((current) => [...current, ...seats]);
      showToast(`${seats.length} adjacent seat(s) selected.`, 'success');
    }
  }, [adjacentCount, findAdjacentSeats, showToast]);

  const handleToggle = useCallback(
    (seat: SeatData) => {
      if (seat.status !== 'available') {
        showToast('This seat is not available for selection.', 'error');
        return;
      }
      setSelectedIds((current) => {
        const index = current.indexOf(seat.id);
        if (index >= 0) {
          showToast(`Removed ${seat.section} Row ${seat.row}, Seat ${seat.number}`, 'info');
          return current.filter((id) => id !== seat.id);
        }
        if (current.length >= MAX_SELECTION) {
          showToast(`Maximum ${MAX_SELECTION} seats allowed. Please remove a seat first.`, 'error');
          return current;
        }
        showToast(`Added ${seat.section} Row ${seat.row}, Seat ${seat.number}`, 'success');
        return [...current, seat.id];
      });
    },
    [showToast],
  );

  const moveFocus = useCallback(
    (seat: SeatData, direction: string) => {
      const section = venueData.sections[seat.sectionIndex];
      if (!section) return;

      let nextRow = seat.row;
      let nextNumber = seat.number;
      if (direction === 'ArrowRight') nextNumber += 1;
      if (direction === 'ArrowLeft') nextNumber -= 1;
      if (direction === 'ArrowDown') nextRow += 1;
      if (direction === 'ArrowUp') nextRow -= 1;

      if (nextNumber < 1) {
        nextRow -= 1;
        nextNumber = section.seatsPerRow;
      }
      if (nextNumber > section.seatsPerRow) {
        nextRow += 1;
        nextNumber = 1;
      }

      if (nextNumber < 1 || nextNumber > section.seatsPerRow || nextRow < 1 || nextRow > section.rows) return;

      const nextId = `${section.id}-${nextRow}-${nextNumber}`;
      const element = document.getElementById(`seat-${nextId}`);
      element?.focus();
    },
    [],
  );

  const performPan = useCallback(
    (clientX: number, clientY: number) => {
      if (!dragRef.current?.active) return;
      const deltaX = clientX - dragRef.current.startX;
      const deltaY = clientY - dragRef.current.startY;
      viewportRef.current = {
        ...viewportRef.current,
        x: dragRef.current.offsetX + deltaX,
        y: dragRef.current.offsetY + deltaY,
      };
      applyViewportTransform();
    },
    [applyViewportTransform],
  );



  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: viewportRef.current.x,
      offsetY: viewportRef.current.y,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragRef.current?.active) return;
    performPan(event.clientX, event.clientY);
  };

  const handleMouseUp = () => {
    if (dragRef.current) dragRef.current.active = false;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.92 : 1.08;
    const nextZoom = clamp(viewportRef.current.zoom * factor, 0.8, 2.5);
    viewportRef.current = { ...viewportRef.current, zoom: nextZoom };
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(() => {
        applyViewportTransform();
        animationFrameRef.current = null;
      });
    }
  };

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      pinchRef.current = {
        startDistance: getTouchDistance(event.touches),
        startZoom: viewportRef.current.zoom,
      };
      dragRef.current = null;
      return;
    }
    const touch = event.touches[0];
    dragRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      offsetX: viewportRef.current.x,
      offsetY: viewportRef.current.y,
    };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2 && pinchRef.current) {
      const distance = getTouchDistance(event.touches);
      const scale = distance / pinchRef.current.startDistance;
      const newZoom = clamp(pinchRef.current.startZoom * scale, 0.8, 2.5);
      viewportRef.current = { ...viewportRef.current, zoom: newZoom };
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(() => {
          applyViewportTransform();
          animationFrameRef.current = null;
        });
      }
      return;
    }
    if (event.touches.length === 1 && dragRef.current?.active) {
      const touch = event.touches[0];
      performPan(touch.clientX, touch.clientY);
    }
  };

  const handleTouchEnd = () => {
    if (dragRef.current) dragRef.current.active = false;
    pinchRef.current = null;
  };

  return (
    <div className="app-shell">
      {isLoading && <div className="loading-overlay"><div className="loading-spinner"></div></div>}

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          <span className="toast-icon">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
          </span>
          {toast.message}
        </div>
      )}

      <header className="hero-panel">
        <div>
          <p className="eyebrow">Event seating selection</p>
          <h1>Interactive venue map</h1>
          <p>Choose up to <strong>8 seats</strong> from any section. Use hover or keyboard navigation to explore.</p>
          <p>{totalSeatCount.toLocaleString()} seats available across {sections.length} sections (A, B, C).</p>
          <p>Each section contains {Math.floor(totalSeatCount / sections.length).toLocaleString()} seats for a total of 15,000 seats.</p>
        </div>

        <div className="controls">
          <div className="toggle-group">
            <button className="mode-toggle" onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
            <button className={`pill ${heatMapEnabled ? 'pill-active' : ''}`} onClick={() => setHeatMapEnabled((current) => !current)}>
              Price Heat Map
            </button>
            <button className={`pill ${liveUpdatesEnabled ? 'pill-active' : ''}`} onClick={() => setLiveUpdatesEnabled((current) => !current)}>
              {liveUpdatesEnabled ? 'Live updates on' : 'Live updates off'}
            </button>
            <span className={`ws-status ws-${wsStatus}`}>{wsStatus === 'connecting' ? 'connecting...' : wsStatus}</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${(selectedSeats.length / MAX_SELECTION) * 100}%` }} />
          </div>
          <p className="limit-note">Maximum {MAX_SELECTION} seats</p>
        </div>
      </header>

      <main className="main-grid">
        <section className="map-panel">
          <div className="map-topbar">
            <div className="section-tabs">
              {['A', 'B', 'C'].map((id) => (
                <button
                  key={id}
                  className={`tab-btn ${activeSectionId === id ? 'tab-active' : ''}`}
                  onClick={() => setActiveSectionId(id)}
                >
                  Section {id}
                </button>
              ))}
            </div>
            <div className="adjacent-controls">
              <label>
                Adjacent seats
                <input
                  type="number"
                  min={1}
                  max={MAX_SELECTION}
                  value={adjacentCount}
                  onChange={(event) => setAdjacentCount(Number(event.target.value))}
                />
              </label>
              <button className="pill" onClick={handleFindAdjacent}>Find seats</button>
            </div>
          </div>

          <div
            className="sections-wrapper"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
            style={{ touchAction: 'none' }}
          >
            <div
              ref={mapContainerRef}
              className="sections-map single-section"
            >
               <SeatMap
                sections={selectedSections}
                selectedIdSet={selectedIdSet}
                liveStatusMap={liveStatusMap}
                heatMapEnabled={heatMapEnabled}
                updatedSeatIdSet={updatedSeatIdSet}
                onToggle={handleToggle}
                onHighlight={setHighlightedSeat}
              />
            </div>
          </div>
        </section>

        <aside className="details-panel">
          <div className="panel-card">
            <h2>Selected seats</h2>
            {selectedSeats.length === 0 ? (
              <p>No seats selected yet. Click an available seat in any section to reserve it.</p>
            ) : (
              <ul className="seat-list">
                {selectedSeats.map((seat) => (
                  <li key={seat.id} className="seat-item">
                    <div>
                      <strong>{seat.section}</strong>
                      <span>Row {seat.row}, Seat {seat.number}</span>
                    </div>
                    <div className="seat-actions">
                      <span>${seat.price.toFixed(2)}</span>
                      <button
                        onClick={() => handleToggle(seat)}
                        aria-label={`Remove seat ${seat.section} ${seat.row}-${seat.number}`}
                        className="unselect-btn"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {highlightedSeat && (
            <div className="panel-card secondary">
              <h2>Seat details</h2>
              <p>{highlightedSeat.section}</p>
              <p>Row {highlightedSeat.row}, Seat {highlightedSeat.number}</p>
              <p>Status: {highlightedSeat.status}</p>
              <p>Price: ${highlightedSeat.price.toFixed(2)}</p>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
