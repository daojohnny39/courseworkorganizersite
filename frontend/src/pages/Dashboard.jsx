import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Pencil, Plus } from 'lucide-react';
import { getAssignments, getCourses, updateAssignment } from '../api';
import AssignmentModal from '../components/AssignmentModal';
import { useSemester } from '../context/SemesterContext';

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

// Convert a #RRGGBB hex color to rgba(r,g,b,alpha)
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

export default function Dashboard() {
  const { semester, year: semYear } = useSemester();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);
  const [activeTypes, setActiveTypes] = useState(new Set()); // empty = all
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingAssignment, setEditingAssignment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDefaultDate, setAddDefaultDate] = useState('');
  // Drag-to-resize state
  const gridRef = useRef(null);
  const dragRef = useRef(null); // { assignment, handle: 'left'|'right', origStart, origEnd }
  const [dragPreview, setDragPreview] = useState(null); // { id, start_date, end_date }

  // Build calendar grid (must be above useCallback hooks that reference these)
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  useEffect(() => {
    setLoading(true);
    Promise.all([getAssignments({ semester, year: semYear }), getCourses({ semester, year: semYear })])
      .then(([aRes, cRes]) => {
        setAssignments(aRes.data);
        setCourses(cRes.data);
      })
      .finally(() => setLoading(false));
  }, [semester, semYear]);

  // ── Drag helpers ───────────────────────────────────────────────
  // Convert a mouse position to a YYYY-MM-DD date by finding the calendar
  // cell element under the cursor (avoids all row/column math bugs).
  const clientXYToDate = useCallback((clientX, clientY) => {
    // Temporarily hide the pill being dragged so elementFromPoint finds the cell beneath
    let el = document.elementFromPoint(clientX, clientY);
    // Walk up the DOM to find a cal-cell with a data-date attribute
    while (el && !el.dataset.calDate) {
      el = el.parentElement;
    }
    return el ? el.dataset.calDate : null;
  }, []);

  const startDrag = useCallback((e, assignment, handle) => {
    e.stopPropagation();
    e.preventDefault();
    dragRef.current = {
      assignment,
      handle,
      origStart: assignment.start_date,
      origEnd: assignment.end_date,
    };
    setDragPreview({ id: assignment.id, start_date: assignment.start_date, end_date: assignment.end_date });

    const onMove = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const date = clientXYToDate(clientX, clientY);
      if (!date || !dragRef.current) return;
      const { handle: h, origStart, origEnd } = dragRef.current;
      if (h === 'left') {
        // Don't allow start to pass end
        if (origEnd && date > origEnd) return;
        setDragPreview(p => ({ ...p, start_date: date }));
      } else {
        if (origStart && date < origStart) return;
        setDragPreview(p => ({ ...p, end_date: date }));
      }
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!dragRef.current || !dragPreviewRef.current) return;
      const { assignment: a } = dragRef.current;
      const preview = dragPreviewRef.current;
      dragRef.current = null;
      setDragPreview(null);
      try {
        const updated = await updateAssignment(a.id, {
          start_date: preview.start_date,
          end_date: preview.end_date,
        });
        setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, ...updated.data } : x));
      } catch {
        // revert silently — UI will snap back since dragPreview is cleared
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [clientXYToDate]);

  // Keep a ref in sync with dragPreview so the mouseup closure can read it
  const dragPreviewRef = useRef(null);
  useEffect(() => { dragPreviewRef.current = dragPreview; }, [dragPreview]);

  const handleSaveAssignment = (saved) => {
    setAssignments(prev => {
      const exists = prev.some(a => a.id === saved.id);
      return exists ? prev.map(a => a.id === saved.id ? { ...a, ...saved } : a) : [...prev, saved];
    });
    setEditingAssignment(null);
    setShowAddModal(false);
  };

  const openAddModal = (dateKey) => {
    setAddDefaultDate(dateKey || '');
    setShowAddModal(true);
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
    const expandRange = (start, end) => {
      const days = [];
      const cur = new Date(start + 'T00:00:00');
      const last = new Date(end + 'T00:00:00');
      while (cur <= last) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        days.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
      }
      return days;
    };

    // Sort assignments into a stable global order before building the map so
    // that spanning pills occupy the same row-index in every cell they touch.
    // Priority: multi-day tasks first (longer spans before shorter), then
    // single-day tasks — with start_date then id as tiebreakers for stability.
    const spanDays = (a) => {
      const sd = (dragPreview && dragPreview.id === a.id) ? dragPreview.start_date : a.start_date;
      const ed = (dragPreview && dragPreview.id === a.id) ? dragPreview.end_date   : a.end_date;
      if (!sd || !ed) return 0;
      return (new Date(ed + 'T00:00:00') - new Date(sd + 'T00:00:00')) / 86400000 + 1;
    };

    const sorted = [...visibleAssignments].sort((a, b) => {
      const aSpan = spanDays(a);
      const bSpan = spanDays(b);
      // Multi-day before single-day
      if ((bSpan > 1) !== (aSpan > 1)) return bSpan > 1 ? 1 : -1;
      // Longer spans first
      if (bSpan !== aSpan) return bSpan - aSpan;
      // Earlier start first
      const aStart = a.start_date || a.due_date || '';
      const bStart = b.start_date || b.due_date || '';
      if (aStart !== bStart) return aStart.localeCompare(bStart);
      // Stable tiebreaker
      return a.id - b.id;
    });

    const map = {};
    sorted.forEach(a => {
      const sd = (dragPreview && dragPreview.id === a.id) ? dragPreview.start_date : a.start_date;
      const ed = (dragPreview && dragPreview.id === a.id) ? dragPreview.end_date   : a.end_date;

      let keys = [];
      if (sd && ed) {
        keys = expandRange(sd, ed);
      } else if (sd) {
        keys = [sd];
      } else if (a.due_date) {
        keys = [a.due_date];
      }
      keys.forEach(k => {
        (map[k] = map[k] || []).push(a);
      });
    });
    return map;
  }, [visibleAssignments, dragPreview]);


  // Assignments for the selected day panel
  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedItems = selectedKey
    ? (byDate[selectedKey] || []).slice().sort((a, b) => {
        const as = a.start_date || a.due_date || '';
        const bs = b.start_date || b.due_date || '';
        return as.localeCompare(bs);
      })
    : [];

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
        <p className="page-subtitle">{semester} {semYear} — Your coursework calendar at a glance.</p>
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
            <h2 className="cal-month-title">
              {MONTH_NAMES[month]} {year}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button className="btn btn-ghost btn-icon" onClick={prevMonth}>
                <ChevronLeft size={18} />
              </button>
              <button
                className="btn btn-primary btn-icon"
                style={{ borderRadius: 8, width: 32, height: 32 }}
                title="Add assignment"
                onClick={() => openAddModal('')}
              >
                <Plus size={16} />
              </button>
              <button className="btn btn-ghost btn-icon" onClick={nextMonth}>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Day-of-week headers */}
          <div className="cal-grid" ref={gridRef}>
            {DAYS_OF_WEEK.map(d => (
              <div key={d} className="cal-dow">{d}</div>
            ))}

            {/* Cells */}
            {(() => {
              // Adjacent month info for overflow cells
              const prevMonthYear = month === 0 ? year - 1 : year;
              const prevMonthIdx  = month === 0 ? 11 : month - 1;
              const nextMonthYear = month === 11 ? year + 1 : year;
              const nextMonthIdx  = month === 11 ? 0 : month + 1;
              const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonthIdx);

              return Array.from({ length: totalCells }, (_, i) => {
                const dayNum = i - firstDay + 1;
                const isCurrentMonth = dayNum >= 1 && dayNum <= daysInMonth;
                const isLeading  = dayNum < 1;
                // isTrailing = dayNum > daysInMonth

                // Resolve the real calendar date for every cell (including overflow)
                let cellYear, cellMonth, cellDay;
                if (isCurrentMonth) {
                  cellYear = year; cellMonth = month; cellDay = dayNum;
                } else if (isLeading) {
                  cellYear = prevMonthYear; cellMonth = prevMonthIdx;
                  cellDay  = daysInPrevMonth + dayNum; // dayNum <= 0 here
                } else {
                  cellYear = nextMonthYear; cellMonth = nextMonthIdx;
                  cellDay  = dayNum - daysInMonth;
                }

                const key = `${cellYear}-${String(cellMonth + 1).padStart(2, '0')}-${String(cellDay).padStart(2, '0')}`;
                const items = byDate[key] || [];
                const isToday    = cellDay === today.getDate() && cellMonth === today.getMonth() && cellYear === today.getFullYear();
                const isSelected = isCurrentMonth && dayNum === selectedDay;
                const isOverflow = !isCurrentMonth;

                const handleClick = isOverflow
                  ? () => { isLeading ? prevMonth() : nextMonth(); }
                  : () => setSelectedDay(isSelected ? null : dayNum);

                return (
                  <div
                    key={i}
                    data-cal-date={key}
                    className={`cal-cell${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${items.length ? ' has-events' : ''}${isOverflow ? ' overflow' : ''}`}
                    onClick={handleClick}
                  >
                    <span className="cal-day-num">{cellDay}</span>
                    {/* Add-button only on current-month cells */}
                    {!isOverflow && (
                      <button
                        className="cal-cell-add-btn"
                        title="Add assignment on this day"
                        onClick={(e) => { e.stopPropagation(); openAddModal(key); }}
                      >
                        <Plus size={11} />
                      </button>
                    )}

                  {/* Event dots / pills */}
                  <div className="cal-events">
                    {items.map((a, idx) => {
                      // Course color takes priority; fall back to assignment-type palette
                      const typeCol = TYPE_COLORS[a.type] || TYPE_COLORS.other;
                      const dotColor  = a.course_color || typeCol.dot;
                      const bgColor   = a.course_color ? hexToRgba(a.course_color, 0.18) : typeCol.bg;
                      const textColor = a.course_color || typeCol.text;
                      const isDue = a.due_date === key;

                      // Resolve dates: dragPreview overrides if this assignment is being dragged
                      const preview = dragPreview && dragPreview.id === a.id ? dragPreview : null;
                      const effectiveStart = preview ? preview.start_date : a.start_date;
                      const effectiveEnd   = preview ? preview.end_date   : a.end_date;

                      // ── Spanning-bar geometry ─────────────────────────
                      const hasRange = !!(effectiveStart && effectiveEnd);
                      const colIndex = i % 7; // 0 = Sun … 6 = Sat
                      // Cap the left side if: no range, task starts here, new week row,
                      // or first day of the displayed month (task carries over from prev month)
                      const capLeft = !hasRange || effectiveStart === key || colIndex === 0 || dayNum === 1;
                      // Cap the right side if: no range, task ends here, or last col of week
                      const capRight = !hasRange || effectiveEnd === key || colIndex === 6;

                      const isDragging = !!preview;

                      const radius = capLeft && capRight ? '4px'
                        : capLeft ? '4px 0 0 4px'
                          : capRight ? '0 4px 4px 0'
                            : '0';

                      const pillStyle = {
                        background: bgColor,
                        color: textColor,
                        borderLeft: capLeft ? `2px solid ${dotColor}` : 'none',
                        borderRadius: radius,
                        // Bleed into cell padding so adjacent cells connect seamlessly
                        marginLeft: capLeft ? 0 : -8,
                        marginRight: capRight ? 0 : -8,
                        paddingLeft: capLeft ? 6 : 8,
                        paddingRight: capRight ? 6 : 8,
                        outline: isDragging ? `2px solid ${dotColor}` : (isDue ? '1.5px solid #f59e0b' : 'none'),
                        outlineOffset: '-1px',
                        boxShadow: isDragging ? `0 0 8px ${dotColor}88` : (isDue ? '0 0 6px rgba(245,158,11,0.35)' : 'none'),
                        opacity: isDragging ? 0.85 : 1,
                      };

                      return (
                        <div
                          key={idx}
                          className="cal-event-pill"
                          style={pillStyle}
                          title={`${a.course_code ? a.course_code + ' · ' : ''}${a.title}${isDue ? ' ⚠ Due today!' : ''}`}
                          onClick={e => { e.stopPropagation(); setEditingAssignment(a); }}
                        >
                          {/* Left drag handle — only on the actual start cell */}
                          {hasRange && capLeft && effectiveStart === key && (
                            <span
                              className="cal-pill-handle cal-pill-handle--left"
                              onMouseDown={e => startDrag(e, a, 'left')}
                            />
                          )}
                          {/* Render text in all cells — visible on the leftmost, hidden on
                              continuation cells so their height matches the start cell exactly */}
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, flex: 1, visibility: capLeft ? 'visible' : 'hidden' }}>
                            {a.course_code && (
                              <span style={{ opacity: 0.7, fontWeight: 800, fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.2 }}>
                                {a.course_code}
                              </span>
                            )}
                            <span style={{ fontWeight: 600, lineHeight: 1.35 }}>{a.title}</span>
                          </span>
                          {/* Right drag handle — only on the actual end cell */}
                          {hasRange && capRight && effectiveEnd === key && (
                            <span
                              className="cal-pill-handle cal-pill-handle--right"
                              onMouseDown={e => startDrag(e, a, 'right')}
                            />
                          )}
                        </div>
                      );
                    })}

                  </div>
                </div>
              );
              });
            })()}
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

      {/* ── Add Assignment Modal ─────────────────────────────────── */}
      {showAddModal && (
        <AssignmentModal
          assignment={null}
          defaultDate={addDefaultDate}
          courses={courses}
          onClose={() => setShowAddModal(false)}
          onSave={handleSaveAssignment}
        />
      )}
    </div>
  );
}
