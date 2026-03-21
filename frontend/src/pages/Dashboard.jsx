import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, X, Pencil } from 'lucide-react';
import { getAssignments, getCourses } from '../api';
import AssignmentModal from '../components/AssignmentModal';

const TYPES = ['homework', 'exam', 'quiz', 'project', 'lab', 'reading', 'other'];
const TYPE_COLORS = {
  homework: { bg: 'rgba(99,102,241,0.18)', text: '#818cf8', dot: '#6366f1' },
  exam: { bg: 'rgba(239,68,68,0.18)', text: '#f87171', dot: '#ef4444' },
  quiz: { bg: 'rgba(245,158,11,0.18)', text: '#fbbf24', dot: '#f59e0b' },
  project: { bg: 'rgba(34,197,94,0.18)', text: '#4ade80', dot: '#22c55e' },
  lab: { bg: 'rgba(56,189,248,0.18)', text: '#38bdf8', dot: '#06b6d4' },
  reading: { bg: 'rgba(167,139,250,0.18)', text: '#a78bfa', dot: '#8b5cf6' },
  other: { bg: 'rgba(148,163,184,0.18)', text: '#94a3b8', dot: '#64748b' },
};

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function Dashboard() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [activeTypes, setActiveTypes] = useState(new Set()); // empty = all
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState(null);

  useEffect(() => {
    Promise.all([getAssignments(), getCourses()])
      .then(([aRes, cRes]) => {
        setAssignments(aRes.data);
        setCourses(cRes.data);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSaveAssignment = (saved) => {
    setAssignments(prev =>
      prev.map(a => a.id === saved.id ? { ...a, ...saved } : a)
    );
    setEditingAssignment(null);
  };

  // Toggle a type filter; if it's already the only one active → clear all
  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setSelectedDay(null);
  };

  const clearTypes = () => { setActiveTypes(new Set()); setSelectedDay(null); };

  // Navigate months
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  // Filter assignments by active types
  const visibleAssignments = useMemo(() => {
    if (activeTypes.size === 0) return assignments;
    return assignments.filter(a => activeTypes.has(a.type));
  }, [assignments, activeTypes]);

  // Map: "YYYY-MM-DD" → assignments[]
  // Each assignment appears on every day from start_date → end_date.
  // Falls back to due_date when no range is set.
  const byDate = useMemo(() => {
    // dateRange inline so the closure is always fresh
    const expandRange = (start, end) => {
      const days = [];
      const cur = new Date(start + 'T00:00:00');
      const last = new Date(end + 'T00:00:00');
      while (cur <= last) {
        // Use local-time getters — toISOString() converts to UTC and
        // shifts dates back for negative-offset timezones (e.g. US Eastern),
        // causing the end date to be silently dropped.
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        days.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    };

    const map = {};
    visibleAssignments.forEach(a => {
      let keys = [];
      if (a.start_date && a.end_date) {
        keys = expandRange(a.start_date, a.end_date);
      } else if (a.start_date) {
        keys = [a.start_date];
      } else if (a.due_date) {
        keys = [a.due_date];
      }
      keys.forEach(k => {
        (map[k] = map[k] || []).push(a);
      });
    });
    return map;
  }, [visibleAssignments]);

  // Build calendar grid
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  // Assignments for the selected day panel
  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedItems = selectedKey ? (byDate[selectedKey] || []) : [];

  // Upcoming: next 7 days – any assignment whose active range overlaps the window
  const upcoming = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const windowEnd = new Date(now); windowEnd.setDate(windowEnd.getDate() + 7);
    return visibleAssignments
      .filter(a => {
        if (a.status === 'completed') return false;
        // Determine the effective date range for this assignment
        const rangeStart = a.start_date || a.due_date;
        const rangeEnd = a.end_date || a.due_date;
        if (!rangeStart) return false;
        const s = new Date(rangeStart + 'T00:00:00');
        const e = new Date(rangeEnd + 'T00:00:00');
        // Show if the range overlaps [now, windowEnd]
        return s <= windowEnd && e >= now;
      })
      .sort((a, b) => {
        const as = a.start_date || a.due_date || '';
        const bs = b.start_date || b.due_date || '';
        return as.localeCompare(bs);
      });
  }, [visibleAssignments]);

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner" />
      <span>Loading calendar…</span>
    </div>
  );

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">Your coursework calendar — see everything at a glance.</p>
      </div>

      {/* ── Type filters ─────────────────────────────────────────── */}
      <div className="cal-filters">
        <button
          className={`cal-filter-chip${activeTypes.size === 0 ? ' active all' : ''}`}
          onClick={clearTypes}
        >
          All
        </button>
        {TYPES.map(t => {
          const on = activeTypes.has(t);
          const col = TYPE_COLORS[t];
          return (
            <button
              key={t}
              className={`cal-filter-chip${on ? ' active' : ''}`}
              style={on ? { background: col.bg, color: col.text, borderColor: col.dot } : {}}
              onClick={() => toggleType(t)}
            >
              <span className="cal-filter-dot" style={{ background: col.dot }} />
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {on && <X size={11} style={{ marginLeft: 2 }} />}
            </button>
          );
        })}
        {activeTypes.size > 0 && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 4 }}>
            {activeTypes.size} filter{activeTypes.size > 1 ? 's' : ''} active
          </span>
        )}
      </div>

      {/* ── Calendar + Side Panel ────────────────────────────────── */}
      <div className="cal-layout">
        {/* Calendar */}
        <div className="cal-card">
          {/* Month nav */}
          <div className="cal-nav">
            <button className="btn btn-ghost btn-icon" onClick={prevMonth}>
              <ChevronLeft size={18} />
            </button>
            <h2 className="cal-month-title">
              {MONTH_NAMES[month]} {year}
            </h2>
            <button className="btn btn-ghost btn-icon" onClick={nextMonth}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="cal-grid">
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="cal-dow">{d}</div>
            ))}

            {/* Cells */}
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - firstDay + 1;
              const isValid = dayNum >= 1 && dayNum <= daysInMonth;
              if (!isValid) return <div key={i} className="cal-cell empty" />;

              const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const items = byDate[key] || [];
              const isToday = dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              const isSelected = dayNum === selectedDay;

              return (
                <div
                  key={i}
                  className={`cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${items.length ? ' has-events' : ''}`}
                  onClick={() => setSelectedDay(isSelected ? null : dayNum)}
                >
                  <span className="cal-day-num">{dayNum}</span>

                  {/* Event dots / pills */}
                  <div className="cal-events">
                    {items.slice(0, 3).map((a, idx) => {
                      const col = TYPE_COLORS[a.type] || TYPE_COLORS.other;
                      const isDue = a.due_date === key;

                      // ── Spanning-bar geometry ─────────────────────────
                      const hasRange = !!(a.start_date && a.end_date);
                      const colIndex = i % 7; // 0 = Sun … 6 = Sat
                      // Cap the left side if: no range, task starts here, or new week row
                      const capLeft = !hasRange || a.start_date === key || colIndex === 0;
                      // Cap the right side if: no range, task ends here, or last col of week
                      const capRight = !hasRange || a.end_date === key || colIndex === 6;

                      const radius = capLeft && capRight ? '4px'
                        : capLeft ? '4px 0 0 4px'
                          : capRight ? '0 4px 4px 0'
                            : '0';

                      const pillStyle = {
                        background: col.bg,
                        color: col.text,
                        borderLeft: capLeft ? `2px solid ${col.dot}` : 'none',
                        borderRadius: radius,
                        // Bleed into cell padding so adjacent cells connect seamlessly
                        marginLeft: capLeft ? 0 : -8,
                        marginRight: capRight ? 0 : -8,
                        paddingLeft: capLeft ? 6 : 8,
                        paddingRight: capRight ? 6 : 8,
                        ...(isDue ? {
                          outline: '1.5px solid #f59e0b',
                          outlineOffset: '-1px',
                          boxShadow: '0 0 6px rgba(245,158,11,0.35)',
                        } : {}),
                      };

                      return (
                        <div
                          key={idx}
                          className="cal-event-pill"
                          style={pillStyle}
                          title={`${a.course_code ? a.course_code + ' · ' : ''}${a.title}${isDue ? ' ⚠ Due today!' : ''}`}
                        >
                          {/* Only render text on the leftmost visible cell of a span */}
                          {capLeft && a.course_code && (
                            <span style={{ opacity: 0.65, fontWeight: 700, marginRight: 4 }}>
                              {a.course_code}
                            </span>
                          )}
                          {capLeft && (a.title.length > 11 ? a.title.slice(0, 11) + '…' : a.title)}
                        </div>
                      );
                    })}
                    {items.length > 3 && (
                      <div className="cal-event-more">+{items.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side Panel */}
        <div className="cal-side">
          {selectedDay ? (
            <>
              <div className="cal-side-header">
                <div>
                  <div className="cal-side-date">
                    {MONTH_NAMES[month]} {selectedDay}, {year}
                  </div>
                  <div className="cal-side-count">
                    {selectedItems.length} assignment{selectedItems.length !== 1 ? 's' : ''}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setSelectedDay(null)}>
                  <X size={16} />
                </button>
              </div>

              {selectedItems.length === 0 ? (
                <div className="cal-side-empty">Nothing due on this day.</div>
              ) : (
                <div className="cal-side-list">
                  {selectedItems.map(a => {
                    const col = TYPE_COLORS[a.type] || TYPE_COLORS.other;
                    return (
                      <div
                        key={a.id}
                        className="cal-side-item cal-side-item--clickable"
                        onClick={() => setEditingAssignment(a)}
                        title="Click to edit"
                      >
                        <div
                          className="cal-side-stripe"
                          style={{ background: a.course_color || col.dot }}
                        />
                        <div className="cal-side-info">
                          <div className="cal-side-title-row">
                            <div className="cal-side-title">{a.title}</div>
                            <Pencil size={13} className="cal-side-edit-icon" />
                          </div>
                          <div className="cal-side-meta">
                            {a.course_code && (
                              <span style={{ color: a.course_color || col.text, fontWeight: 600 }}>
                                {a.course_code}
                              </span>
                            )}
                            <span
                              className={`type-badge type-${a.type}`}
                              style={{ padding: '2px 8px' }}
                            >
                              {a.type}
                            </span>
                            {a.status === 'completed' && (
                              <span style={{ color: 'var(--success)', fontSize: 11 }}>✓ done</span>
                            )}
                          </div>
                          {a.description && (
                            <div className="cal-side-desc">{a.description}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="cal-side-header">
                <div>
                  <div className="cal-side-date">Next 7 Days</div>
                  <div className="cal-side-count">
                    {upcoming.length} upcoming
                  </div>
                </div>
              </div>

              {upcoming.length === 0 ? (
                <div className="cal-side-empty">
                  🎉 Nothing due in the next week!
                </div>
              ) : (
                <div className="cal-side-list">
                  {upcoming.map(a => {
                    const col = TYPE_COLORS[a.type] || TYPE_COLORS.other;
                    const anchor = a.start_date || a.due_date;
                    const refDate = new Date(anchor + 'T00:00:00');
                    const now = new Date(); now.setHours(0, 0, 0, 0);
                    const diff = Math.round((refDate - now) / 86400000);
                    // If work is already in-progress (start was in the past, end is future)
                    const isOngoing = diff < 0 && a.end_date && new Date(a.end_date + 'T00:00:00') >= now;
                    const label = isOngoing ? 'In progress'
                      : diff === 0 ? 'Starts today'
                        : diff === 1 ? 'Starts tomorrow'
                          : diff > 0 ? `Starts in ${diff} days`
                            : 'Due soon';
                    const urgent = diff <= 1;
                    return (
                      <div key={a.id} className="cal-side-item">
                        <div
                          className="cal-side-stripe"
                          style={{ background: a.course_color || col.dot }}
                        />
                        <div className="cal-side-info">
                          <div className="cal-side-title">{a.title}</div>
                          <div className="cal-side-meta">
                            {a.course_code && (
                              <span style={{ color: a.course_color || col.text, fontWeight: 600 }}>
                                {a.course_code}
                              </span>
                            )}
                            <span className={`type-badge type-${a.type}`}>{a.type}</span>
                            <span style={{ color: isOngoing ? 'var(--success)' : urgent ? 'var(--warning)' : 'var(--text-muted)', fontSize: 11, fontWeight: urgent || isOngoing ? 600 : 400 }}>
                              {label}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Edit Assignment Modal ─────────────────────────────────── */}
      {editingAssignment && (
        <AssignmentModal
          assignment={editingAssignment}
          courses={courses}
          onClose={() => setEditingAssignment(null)}
          onSave={handleSaveAssignment}
        />
      )}
    </div>
  );
}
