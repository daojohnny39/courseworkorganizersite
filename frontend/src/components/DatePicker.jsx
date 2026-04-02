import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, X } from 'lucide-react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function parseDate(str) {
  // str is "YYYY-MM-DD" or ""
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

function formatDisplay(str) {
  const p = parseDate(str);
  if (!p) return '';
  return `${SHORT_MONTHS[p.month]} ${p.day}, ${p.year}`;
}

function toKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function DatePicker({ value, onChange, placeholder = 'Select date…', id }) {
  const [open, setOpen] = useState(false);
  const today = new Date();

  // Calendar view state — initialise to value's month or today
  const init = parseDate(value);
  const [viewYear, setViewYear] = useState(init?.year ?? today.getFullYear());
  const [viewMonth, setViewMonth] = useState(init?.month ?? today.getMonth());

  const wrapperRef = useRef(null);

  // Sync view when value changes externally (e.g. pre-fill from day click)
  useEffect(() => {
    const p = parseDate(value);
    if (p) { setViewYear(p.year); setViewMonth(p.month); }
  }, [value]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const selectedParsed = parseDate(value);
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const selectDay = (day) => {
    onChange(toKey(viewYear, viewMonth, day));
    setOpen(false);
  };

  const clearValue = (e) => {
    e.stopPropagation();
    onChange('');
  };

  return (
    <div className="dp-wrapper" ref={wrapperRef}>
      {/* Trigger */}
      <button
        id={id}
        type="button"
        className={`dp-trigger form-input${open ? ' dp-trigger--open' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <CalendarDays size={15} className="dp-icon" />
        <span className={value ? 'dp-value' : 'dp-placeholder'}>
          {value ? formatDisplay(value) : placeholder}
        </span>
        {value && (
          <span className="dp-clear" onClick={clearValue} title="Clear">
            <X size={12} />
          </span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div className="dp-popup">
          {/* Mini calendar nav */}
          <div className="dp-nav">
            <button type="button" className="dp-nav-btn" onClick={prevMonth}>
              <ChevronLeft size={14} />
            </button>
            <span className="dp-nav-title">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" className="dp-nav-btn" onClick={nextMonth}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Day-of-week row */}
          <div className="dp-grid">
            {DOW.map(d => (
              <div key={d} className="dp-dow">{d}</div>
            ))}

            {/* Cells */}
            {Array.from({ length: totalCells }, (_, i) => {
              const day = i - firstDow + 1;
              if (day < 1 || day > daysInMonth) {
                return <div key={i} className="dp-cell dp-cell--empty" />;
              }
              const key = toKey(viewYear, viewMonth, day);
              const isSelected = selectedParsed &&
                selectedParsed.year === viewYear &&
                selectedParsed.month === viewMonth &&
                selectedParsed.day === day;
              const isToday = key === todayKey;
              return (
                <button
                  key={i}
                  type="button"
                  className={`dp-cell${isSelected ? ' dp-cell--selected' : ''}${isToday && !isSelected ? ' dp-cell--today' : ''}`}
                  onClick={() => selectDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Quick actions */}
          <div className="dp-footer">
            <button type="button" className="dp-footer-btn" onClick={() => {
              onChange(todayKey);
              setOpen(false);
            }}>Today</button>
            {value && (
              <button type="button" className="dp-footer-btn dp-footer-btn--clear" onClick={() => { onChange(''); setOpen(false); }}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
