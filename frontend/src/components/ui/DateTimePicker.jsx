import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './DateTimePicker.css';

function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

const MONTH_NAMES = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const WEEKDAYS = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];

function formatDisplayDate(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} alle ${hours}:${minutes}`;
}

function getRelativeText(date) {
  if (!date) return '';
  const now = new Date();
  const target = new Date(date);
  const diffMs = target - now;
  if (diffMs < 0) return 'Passato';
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (diffDays > 0) return `tra ${diffDays}g ${diffHours}h`;
  const diffMin = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours > 0) return `tra ${diffHours}h ${diffMin}m`;
  return `tra ${diffMin}m`;
}

export default function DateTimePicker({ value, onChange, minDate, placeholder = 'Seleziona data e ora' }) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    if (value) return new Date(value);
    return new Date();
  });
  const [selectedDate, setSelectedDate] = useState(() => value ? new Date(value) : null);
  const [hours, setHours] = useState(() => value ? new Date(value).getHours() : 12);
  const [minutes, setMinutes] = useState(() => value ? new Date(value).getMinutes() : 0);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  // Calculate position from trigger button
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const isMobile = window.innerWidth <= 480;

    if (isMobile) {
      // Mobile: bottom sheet style handled by CSS
      setPopoverPos({ top: 0, left: 0, isMobile: true });
    } else {
      // Desktop: position below trigger, clamped to viewport
      let top = rect.bottom + 8;
      let left = rect.left;
      const popoverWidth = 300;
      const popoverHeight = 420;

      // Clamp right edge
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      // Clamp left edge
      if (left < 16) left = 16;

      // If not enough space below, show above
      if (top + popoverHeight > window.innerHeight - 16) {
        top = rect.top - popoverHeight - 8;
        if (top < 16) top = 16;
      }

      setPopoverPos({ top, left, isMobile: false });
    }
  }, []);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Recalculate position on open, scroll, resize
  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  // Sync state when value prop changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value);
      setSelectedDate(d);
      setHours(d.getHours());
      setMinutes(d.getMinutes());
      setViewDate(d);
    }
  }, [value]);

  const getDaysGrid = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = [];
    const startPad = firstDay === 0 ? 6 : firstDay - 1;
    for (let i = 0; i < startPad; i++) grid.push(null);
    for (let d = 1; d <= daysInMonth; d++) grid.push(d);
    return grid;
  };

  const prevMonth = () => {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  const confirmSelection = () => {
    if (!selectedDate) return;
    const result = new Date(selectedDate);
    result.setHours(hours, minutes, 0, 0);
    onChange(result.toISOString());
    setOpen(false);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const minDateNorm = minDate ? new Date(minDate) : today;
  minDateNorm.setHours(0, 0, 0, 0);

  const displayValue = value ? formatDisplayDate(value) : null;
  const relativeText = value ? getRelativeText(value) : null;

  const popoverContent = open ? (
    <div
      ref={popoverRef}
      className={`dtp-popover-portal ${popoverPos.isMobile ? 'dtp-popover-mobile' : ''}`}
      style={popoverPos.isMobile ? {} : { top: popoverPos.top, left: popoverPos.left }}
    >
      <div className="dtp-month-nav">
        <button type="button" onClick={prevMonth}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span>{MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
        <button type="button" onClick={nextMonth}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <div className="dtp-weekdays">
        {WEEKDAYS.map(d => <span key={d}>{d}</span>)}
      </div>

      <div className="dtp-days-grid">
        {getDaysGrid().map((day, i) => {
          if (!day) return <span key={`empty-${i}`} />;
          const thisDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
          const isSelected = selectedDate && thisDate.toDateString() === selectedDate.toDateString();
          const isPast = thisDate < minDateNorm;
          const isToday = thisDate.toDateString() === new Date().toDateString();

          return (
            <button
              key={day}
              type="button"
              disabled={isPast}
              className={`dtp-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}`}
              onClick={() => setSelectedDate(thisDate)}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="dtp-time-picker">
        <span className="dtp-time-label">Ora</span>
        <div className="dtp-time-inputs">
          <div className="dtp-time-spinbox">
            <button type="button" onClick={() => setHours(h => (h + 1) % 24)}>&#x25B2;</button>
            <span>{String(hours).padStart(2, '0')}</span>
            <button type="button" onClick={() => setHours(h => (h - 1 + 24) % 24)}>&#x25BC;</button>
          </div>
          <span className="dtp-colon">:</span>
          <div className="dtp-time-spinbox">
            <button type="button" onClick={() => setMinutes(m => (m + 15) % 60)}>&#x25B2;</button>
            <span>{String(minutes).padStart(2, '0')}</span>
            <button type="button" onClick={() => setMinutes(m => (m - 15 + 60) % 60)}>&#x25BC;</button>
          </div>
        </div>
      </div>

      <div className="dtp-actions">
        <button type="button" className="dtp-cancel" onClick={() => setOpen(false)}>
          Annulla
        </button>
        <button
          type="button"
          className="dtp-confirm"
          disabled={!selectedDate}
          onClick={confirmSelection}
        >
          Conferma
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="dtp-wrapper">
      <button ref={triggerRef} type="button" className="dtp-trigger" onClick={() => setOpen(o => !o)}>
        <CalendarIcon />
        <span className={displayValue ? 'has-value' : 'placeholder'}>
          {displayValue || placeholder}
        </span>
        {relativeText && <span className="dtp-relative">{relativeText}</span>}
      </button>

      {popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
}
