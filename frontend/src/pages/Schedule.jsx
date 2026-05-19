import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Plus, X, Trash2, MapPin } from 'lucide-react';
import { getEvents, createEvent, updateEvent, deleteEvent, getCourses } from '../api';
import { useSemester } from '../context/SemesterContext';

// ── Constants ──────────────────────────────────────────────────────────────────

const EVENT_TYPES = ['class', 'study', 'office_hours', 'meeting', 'personal', 'other'];
const EVENT_TYPE_LABELS = {
  class: 'Class', study: 'Study', office_hours: 'Office Hours',
  meeting: 'Meeting', personal: 'Personal', other: 'Other',
};
const EVENT_TYPE_COLORS = {
  class:        { bg: 'rgba(124,58,237,0.12)',  text: '#7c3aed', border: '#7c3aed' },
  study:        { bg: 'rgba(16,185,129,0.12)',  text: '#059669', border: '#10b981' },
  office_hours: { bg: 'rgba(245,158,11,0.12)',  text: '#d97706', border: '#f59e0b' },
  meeting:      { bg: 'rgba(59,130,246,0.12)',  text: '#2563eb', border: '#3b82f6' },
  personal:     { bg: 'rgba(236,72,153,0.12)',  text: '#be185d', border: '#ec4899' },
  other:        { bg: 'rgba(100,116,139,0.12)', text: '#475569', border: '#64748b' },
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_ABBREVS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const RECUR_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const GRID_START_HOUR = 7;   // 7 AM
const GRID_END_HOUR   = 22;  // 10 PM
const TOTAL_HOURS     = GRID_END_HOUR - GRID_START_HOUR; // 15
const HOUR_HEIGHT     = 64;  // px per hour
const GRID_HEIGHT     = TOTAL_HOURS * HOUR_HEIGHT;       // 960px

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeToMins(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

function minsToTime(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTime12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function toYMD(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getWeekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function isEventOnDate(event, date) {
  const ymd = toYMD(date);
  const abbrev = DAY_ABBREVS[date.getDay()];
  if (event.days_of_week) {
    const days = event.days_of_week.split(',').map(d => d.trim().toUpperCase());
    if (!days.includes(abbrev)) return false;
    if (event.start_date && ymd < event.start_date) return false;
    if (event.end_date   && ymd > event.end_date)   return false;
    return true;
  }
  return event.start_date === ymd;
}

function getEventColors(event) {
  if (event.color) {
    const hex = event.color;
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { bg: `rgba(${r},${g},${b},0.22)`, text: hex, border: hex };
  }
  if (event.course_color) {
    const hex = event.course_color;
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return { bg: `rgba(${r},${g},${b},0.22)`, text: hex, border: hex };
  }
  return EVENT_TYPE_COLORS[event.type] || EVENT_TYPE_COLORS.other;
}

// ── EventModal ─────────────────────────────────────────────────────────────────

function EventModal({ event, courses, semester, year, defaultDate, defaultTime, onSave, onDelete, onClose }) {
  const isEdit = !!event;

  const [form, setForm] = useState(() => {
    if (event) {
      return {
        title:        event.title || '',
        type:         event.type || 'class',
        course_id:    event.course_id ? String(event.course_id) : '',
        location:     event.location || '',
        notes:        event.notes || '',
        start_time:   event.start_time || '09:00',
        end_time:     event.end_time   || '10:00',
        is_recurring: !!event.days_of_week,
        days_of_week: event.days_of_week
          ? event.days_of_week.split(',').map(d => d.trim().toUpperCase())
          : [],
        start_date: event.start_date || '',
        end_date:   event.end_date   || '',
      };
    }
    const initDays = defaultDate
      ? [DAY_ABBREVS[new Date(defaultDate + 'T00:00:00').getDay()]]
      : [];
    const endTime = defaultTime
      ? minsToTime(Math.min(timeToMins(defaultTime) + 60, GRID_END_HOUR * 60))
      : '10:00';
    return {
      title: '', type: 'class', course_id: '', location: '', notes: '',
      start_time:   defaultTime || '09:00',
      end_time:     endTime,
      is_recurring: false,
      days_of_week: initDays,
      start_date:   defaultDate || '',
      end_date:     '',
    };
  });

  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const toggleDay = (abbrev) => {
    set('days_of_week', form.days_of_week.includes(abbrev)
      ? form.days_of_week.filter(d => d !== abbrev)
      : [...form.days_of_week, abbrev]);
  };

  const handleSubmit = async () => {
    if (!form.title.trim())                                    { setError('Title is required.'); return; }
    if (!form.start_time)                                      { setError('Start time is required.'); return; }
    if (!form.end_time)                                        { setError('End time is required.'); return; }
    if (form.is_recurring && form.days_of_week.length === 0)   { setError('Select at least one day.'); return; }
    if (!form.is_recurring && !form.start_date)                { setError('Date is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const payload = {
        title:        form.title.trim(),
        type:         form.type,
        course_id:    form.course_id ? Number(form.course_id) : null,
        location:     form.location.trim() || null,
        notes:        form.notes.trim() || null,
        start_time:   form.start_time,
        end_time:     form.end_time,
        semester,
        year,
        days_of_week: form.is_recurring ? form.days_of_week.join(',') : null,
        start_date:   form.start_date || null,
        end_date:     form.is_recurring ? (form.end_date || null) : (form.start_date || null),
      };
      let res;
      if (isEdit) {
        res = await updateEvent(event.id, payload);
      } else {
        res = await createEvent(payload);
      }
      onSave(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    try {
      await deleteEvent(event.id);
      onDelete(event.id);
      onClose();
    } catch {
      setError('Failed to delete event.');
    }
  };

  const lbl = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em',
    marginBottom: 5, display: 'block',
  };
  const inp = {
    width: '100%', padding: '8px 10px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 7, color: 'var(--text-primary)', fontSize: 13,
    outline: 'none', boxSizing: 'border-box',
  };
  const focusIn  = e => { e.target.style.borderColor = 'var(--border-focus)'; };
  const focusOut = e => { e.target.style.borderColor = 'var(--border)'; };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit Event' : 'New Event'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label style={lbl}>Title</label>
            <input
              style={inp} value={form.title} placeholder="Event title" autoFocus
              onChange={e => set('title', e.target.value)}
              onFocus={focusIn} onBlur={focusOut}
            />
          </div>

          {/* Type + Course */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Type</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={form.type} onChange={e => set('type', e.target.value)}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Course (optional)</label>
              <select style={{ ...inp, cursor: 'pointer' }} value={form.course_id} onChange={e => set('course_id', e.target.value)}>
                <option value="">— None —</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
              </select>
            </div>
          </div>

          {/* Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={lbl}>Start Time</label>
              <input type="time" style={inp} value={form.start_time} onChange={e => set('start_time', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
            </div>
            <div>
              <label style={lbl}>End Time</label>
              <input type="time" style={inp} value={form.end_time} onChange={e => set('end_time', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
            </div>
          </div>

          {/* Recurring toggle */}
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => set('is_recurring', !form.is_recurring)}
            >
              <div style={{
                width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: 'relative', transition: 'background 0.2s',
                background: form.is_recurring ? 'var(--accent)' : 'var(--bg-surface)',
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2,
                  left: form.is_recurring ? 18 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>Recurring weekly</span>
            </div>
          </div>

          {/* Days of week */}
          {form.is_recurring && (
            <div>
              <label style={lbl}>Days</label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {RECUR_DAYS.map(d => {
                  const active = form.days_of_week.includes(d);
                  return (
                    <button key={d} onClick={() => toggleDay(d)} style={{
                      padding: '5px 9px', borderRadius: 6, border: '1px solid', cursor: 'pointer',
                      borderColor: active ? 'var(--accent)' : 'var(--border)',
                      background:  active ? 'var(--accent-surface)' : 'transparent',
                      color:       active ? 'var(--accent-light)' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: 700, transition: 'all 0.12s',
                    }}>{d}</button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Date(s) */}
          {form.is_recurring ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>From (optional)</label>
                <input type="date" style={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
              </div>
              <div>
                <label style={lbl}>Until (optional)</label>
                <input type="date" style={inp} value={form.end_date} onChange={e => set('end_date', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
              </div>
            </div>
          ) : (
            <div>
              <label style={lbl}>Date</label>
              <input type="date" style={inp} value={form.start_date} onChange={e => set('start_date', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
            </div>
          )}

          {/* Location */}
          <div>
            <label style={lbl}>Location (optional)</label>
            <input style={inp} value={form.location} placeholder="Room, building, link…" onChange={e => set('location', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
          </div>

          {/* Notes */}
          <div>
            <label style={lbl}>Notes (optional)</label>
            <textarea style={{ ...inp, resize: 'vertical', minHeight: 56 }} value={form.notes} placeholder="Any additional info…" onChange={e => set('notes', e.target.value)} onFocus={focusIn} onBlur={focusOut} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: 'var(--danger)', padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 7 }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            {isEdit && (
              <button
                onClick={handleDelete}
                style={{
                  padding: '9px 14px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
                  borderColor: confirmDelete ? 'var(--danger)' : 'var(--border)',
                  background:  confirmDelete ? 'rgba(239,68,68,0.15)' : 'transparent',
                  color:       confirmDelete ? '#f87171' : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                }}
              >
                <Trash2 size={13} />
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            )}
            <button onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={saving} style={{ flex: 2, padding: '9px 0', borderRadius: 8, border: 'none', background: saving ? 'rgba(99,102,241,0.5)' : 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── MiniCalendar ───────────────────────────────────────────────────────────────

function MiniCalendar({ weekDates, weekStart, onSelectWeek }) {
  const [miniMonth, setMiniMonth] = useState(() => weekStart.getMonth());
  const [miniYear, setMiniYear]   = useState(() => weekStart.getFullYear());

  useEffect(() => {
    setMiniMonth(weekStart.getMonth());
    setMiniYear(weekStart.getFullYear());
  }, [weekStart]);

  const daysInMonth = new Date(miniYear, miniMonth + 1, 0).getDate();
  const firstDay    = new Date(miniYear, miniMonth, 1).getDay();
  const totalCells  = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const weekDateSet = useMemo(() => new Set(weekDates.map(d => toYMD(d))), [weekDates]);
  const todayYMD    = toYMD(new Date());

  const prevMiniMonth = () => {
    if (miniMonth === 0) { setMiniMonth(11); setMiniYear(y => y - 1); }
    else setMiniMonth(m => m - 1);
  };
  const nextMiniMonth = () => {
    if (miniMonth === 11) { setMiniMonth(0); setMiniYear(y => y + 1); }
    else setMiniMonth(m => m + 1);
  };

  return (
    <div style={{
      width: 252, flexShrink: 0,
      padding: 16,
      overflowY: 'auto',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-md)',
        display: 'flex',
        flexDirection: 'column',
      }}>
      {/* Month nav */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 12px 10px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
      }}>
        <button
          onClick={prevMiniMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 4, borderRadius: 5 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <ChevronLeft size={13} />
        </button>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
          {MONTH_NAMES[miniMonth]} {miniYear}
        </span>
        <button
          onClick={nextMiniMonth}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 4, borderRadius: 5 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px 10px 4px' }}>
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '2px 10px 12px', rowGap: 2 }}>
        {Array.from({ length: totalCells }, (_, i) => {
          const dayNum = i - firstDay + 1;
          const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;

          let cellDate;
          if (isCurrentMonth) {
            cellDate = new Date(miniYear, miniMonth, dayNum);
          } else if (dayNum < 1) {
            const pmy = miniMonth === 0 ? miniYear - 1 : miniYear;
            const pmi = miniMonth === 0 ? 11 : miniMonth - 1;
            const dip = new Date(pmy, pmi + 1, 0).getDate();
            cellDate = new Date(pmy, pmi, dip + dayNum);
          } else {
            const nmy = miniMonth === 11 ? miniYear + 1 : miniYear;
            const nmi = miniMonth === 11 ? 0 : miniMonth + 1;
            cellDate = new Date(nmy, nmi, dayNum - daysInMonth);
          }

          const ymd      = toYMD(cellDate);
          const isInWeek = weekDateSet.has(ymd);
          const isTdy    = ymd === todayYMD;

          return (
            <div
              key={i}
              onClick={() => onSelectWeek(getWeekStart(cellDate))}
              style={{
                textAlign: 'center',
                fontSize: 11,
                lineHeight: '24px',
                height: 24,
                borderRadius: 4,
                cursor: 'pointer',
                fontWeight: isTdy ? 700 : isInWeek ? 600 : 400,
                color: isTdy
                  ? '#fff'
                  : isInWeek
                    ? 'var(--accent-light)'
                    : isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)',
                background: isTdy
                  ? 'var(--accent)'
                  : isInWeek
                    ? 'var(--accent-surface)'
                    : 'transparent',
                opacity: isCurrentMonth ? 1 : 0.4,
              }}
            >
              {cellDate.getDate()}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

// ── Schedule ───────────────────────────────────────────────────────────────────

export default function Schedule() {
  const { semester, year: semYear } = useSemester();
  const todayDate = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);

  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [events, setEvents]       = useState([]);
  const [courses, setCourses]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null); // null | { mode, event?, defaultDate?, defaultTime? }
  const [hoverInfo, setHoverInfo] = useState(null); // null | { colIdx, snappedMins }

  // The 7 dates for the displayed week
  const weekDates = useMemo(() => DAYS.map((_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  }), [weekStart]);

  // Week header label
  const weekLabel = useMemo(() => {
    const s = weekDates[0], e = weekDates[6];
    if (s.getMonth() === e.getMonth())
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
    return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${e.getFullYear()}`;
  }, [weekDates]);

  useEffect(() => {
    if (!semester || !semYear) return;
    setLoading(true);
    Promise.all([
      getEvents({ semester, year: semYear }),
      getCourses({ semester, year: semYear }),
    ]).then(([eRes, cRes]) => {
      setEvents(eRes.data);
      setCourses(cRes.data);
    }).finally(() => setLoading(false));
  }, [semester, semYear]);

  const prevWeek = () => setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; });
  const nextWeek = () => setWeekStart(ws => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; });
  const goToday  = () => setWeekStart(getWeekStart(new Date()));

  const handleSave = (saved) => {
    setEvents(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
  };

  const handleDelete = (id) => setEvents(prev => prev.filter(e => e.id !== id));

  // Mouse over a day column → snap to nearest 30-min slot for hover plus button
  const handleColumnMouseMove = (e, colIdx) => {
    if (e.target.closest('[data-event]')) { setHoverInfo(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const rawMins = ((e.clientY - rect.top) / HOUR_HEIGHT) * 60 + GRID_START_HOUR * 60;
    const snapped = Math.round(rawMins / 30) * 30;
    const clamped = Math.max(GRID_START_HOUR * 60, Math.min((GRID_END_HOUR - 1) * 60, snapped));
    setHoverInfo(h => (h?.colIdx === colIdx && h?.snappedMins === clamped) ? h : { colIdx, snappedMins: clamped });
  };

  // Events per day column
  const eventsByDay = useMemo(
    () => weekDates.map(date => events.filter(ev => isEventOnDate(ev, date))),
    [events, weekDates]
  );

  const isToday = (date) => toYMD(date) === toYMD(todayDate);

  // Hour labels: 7 AM through 10 PM
  const hourMarkers = useMemo(() => Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
    const h = GRID_START_HOUR + i;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return { h, label: `${hour} ${period}`, topPx: i * HOUR_HEIGHT };
  }), []);

  if (!semester) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh', color: 'var(--text-muted)', fontSize: 14 }}>
        Select a semester to view your schedule.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '20px 24px 16px', flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>Schedule</h1>
          <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{semester} {semYear}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Week navigator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 9, padding: '3px 6px' }}>
            <button onClick={prevWeek} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 5, borderRadius: 5 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', minWidth: 166, textAlign: 'center' }}>{weekLabel}</span>
            <button onClick={nextWeek} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: 5, borderRadius: 5 }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'} onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <ChevronRight size={14} />
            </button>
          </div>

          <button onClick={goToday} style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
            Today
          </button>

          <button onClick={() => setModal({ mode: 'create' })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={14} /> Add Event
          </button>
        </div>
      </div>

      {/* ── Calendar body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'row' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Scrollable area — header is sticky inside so widths always match */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Day header row - sticky */}
          <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 30, background: 'var(--bg-base)' }}>
            <div /> {/* time gutter spacer */}
            {weekDates.map((date, i) => {
              const tod = isToday(date);
              return (
                <div key={i} style={{ padding: '10px 6px', textAlign: 'center', borderLeft: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                    {DAYS[i]}
                  </div>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: '50%',
                    background: tod ? 'var(--accent)' : 'transparent',
                    color: tod ? '#fff' : 'var(--text-primary)',
                    fontSize: 14, fontWeight: tod ? 700 : 500,
                  }}>
                    {date.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {loading ? (
            <div style={{ height: GRID_HEIGHT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
              Loading…
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '52px repeat(7, 1fr)', minHeight: GRID_HEIGHT }}>

              {/* Time labels */}
              <div style={{ position: 'relative', height: GRID_HEIGHT, borderRight: '1px solid var(--border)' }}>
                {hourMarkers.map(({ h, label, topPx }) => (
                  <div key={h} style={{
                    position: 'absolute', top: topPx,
                    left: 0, right: 0, textAlign: 'right', paddingRight: 8,
                    fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', lineHeight: 1, pointerEvents: 'none',
                    transform: 'translateY(-50%)',
                  }}>
                    {h > GRID_START_HOUR ? label : ''}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDates.map((date, colIdx) => (
                <div
                  key={colIdx}
                  style={{ position: 'relative', height: GRID_HEIGHT, borderLeft: '1px solid var(--border)' }}
                  onMouseMove={e => handleColumnMouseMove(e, colIdx)}
                  onMouseLeave={() => setHoverInfo(null)}
                >
                  {/* Today highlight */}
                  {isToday(date) && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(99,102,241,0.03)', pointerEvents: 'none' }} />
                  )}

                  {/* Hour grid lines */}
                  {hourMarkers.map(({ h, topPx }) => (
                    <div key={h} style={{
                      position: 'absolute', top: topPx, left: 0, right: 0, pointerEvents: 'none',
                      borderTop: h === GRID_START_HOUR ? 'none' : '1px solid var(--border)',
                    }} />
                  ))}

                  {/* Half-hour lines */}
                  {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                    <div key={i} style={{
                      position: 'absolute', top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2, left: 0, right: 0,
                      borderTop: '1px solid rgba(255,255,255,0.04)', pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Hover plus button */}
                  {hoverInfo?.colIdx === colIdx && (() => {
                    const slotTop = (hoverInfo.snappedMins - GRID_START_HOUR * 60) / 60 * HOUR_HEIGHT;
                    return (
                      <div style={{ position: 'absolute', top: slotTop, left: 0, right: 0, height: 0, borderTop: '1px dashed var(--accent)', zIndex: 20, pointerEvents: 'none' }}>
                        <button
                          onClick={e => { e.stopPropagation(); setModal({ mode: 'create', defaultDate: toYMD(date), defaultTime: minsToTime(hoverInfo.snappedMins) }); }}
                          style={{
                            pointerEvents: 'all',
                            position: 'absolute', right: 3, top: 0,
                            transform: 'translateY(-50%)',
                            width: 20, height: 20, borderRadius: '50%',
                            background: 'var(--accent)', border: 'none',
                            color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                            transition: 'transform 0.1s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-50%) scale(1.15)'; }}
                          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(-50%) scale(1)'; }}
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    );
                  })()}

                  {/* Events */}
                  {eventsByDay[colIdx].map(ev => {
                    const startMins = timeToMins(ev.start_time);
                    const endMins   = timeToMins(ev.end_time || ev.start_time);
                    const topPx     = (startMins - GRID_START_HOUR * 60) / 60 * HOUR_HEIGHT;
                    const heightPx  = Math.max(22, (endMins - startMins) / 60 * HOUR_HEIGHT);
                    const colors    = getEventColors(ev);
                    return (
                      <div
                        key={ev.id}
                        data-event="1"
                        onClick={e => { e.stopPropagation(); setModal({ mode: 'edit', event: ev }); }}
                        style={{
                          position: 'absolute', top: Math.max(0, topPx), left: 3, right: 3,
                          height: heightPx,
                          background: colors.bg,
                          borderLeft: `3px solid ${colors.border}`,
                          borderRadius: 5, padding: '3px 6px',
                          overflow: 'hidden', cursor: 'pointer', zIndex: 10,
                          transition: 'filter 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.25)'}
                        onMouseLeave={e => e.currentTarget.style.filter = 'none'}
                      >
                        <div style={{ fontSize: 11, fontWeight: 700, color: colors.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
                          {ev.title}
                        </div>
                        {heightPx > 34 && (
                          <div style={{ fontSize: 10, color: colors.text, opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                            {formatTime12(ev.start_time)}{ev.end_time ? ` – ${formatTime12(ev.end_time)}` : ''}
                          </div>
                        )}
                        {heightPx > 50 && ev.course_code && (
                          <div style={{ fontSize: 10, color: colors.text, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>
                            {ev.course_code}
                          </div>
                        )}
                        {heightPx > 68 && ev.location && (
                          <div style={{ fontSize: 10, color: colors.text, opacity: 0.65, display: 'flex', alignItems: 'center', gap: 2, lineHeight: 1.3 }}>
                            <MapPin size={9} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ev.location}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
        <MiniCalendar weekDates={weekDates} weekStart={weekStart} onSelectWeek={setWeekStart} />
      </div>

      {/* ── Modal ──────────────────────────────────────────────────────── */}
      {modal && (
        <EventModal
          event={modal.mode === 'edit' ? modal.event : null}
          courses={courses}
          semester={semester}
          year={semYear}
          defaultDate={modal.defaultDate}
          defaultTime={modal.defaultTime}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
