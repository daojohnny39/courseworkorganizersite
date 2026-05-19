import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X, Pencil, Plus, Check } from 'lucide-react';
import { getAssignments, getCourses, updateAssignment } from '../api';
import AssignmentModal from '../components/AssignmentModal';
import { useSemester } from '../context/SemesterContext';

const TYPES = ['homework', 'exam', 'quiz', 'project', 'lab', 'reading', 'other'];
const TYPE_COLORS = {
  homework: { bg: 'rgba(124,58,237,0.12)', text: '#7c3aed', dot: '#7c3aed' },
  exam: { bg: 'rgba(239,68,68,0.12)', text: '#dc2626', dot: '#ef4444' },
  quiz: { bg: 'rgba(245,158,11,0.12)', text: '#d97706', dot: '#f59e0b' },
  project: { bg: 'rgba(16,185,129,0.12)', text: '#059669', dot: '#10b981' },
  lab: { bg: 'rgba(59,130,246,0.12)', text: '#2563eb', dot: '#3b82f6' },
  reading: { bg: 'rgba(167,139,250,0.12)', text: '#6d28d9', dot: '#8b5cf6' },
  other: { bg: 'rgba(100,116,139,0.12)', text: '#475569', dot: '#64748b' },
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

/** YYYY-MM-DD plus integer calendar days (local timezone). */
function addCalendarDays(ymd, deltaDays) {
  const ms = new Date(ymd + 'T00:00:00').getTime() + deltaDays * 86400000;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  // Drag-to-resize / drag-to-move state
  const gridRef = useRef(null);
  const dragRef = useRef(null); // { assignment, handle: 'left'|'right'|'move', origStart, origEnd, anchorDate }
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

  const startDrag = useCallback((e, assignment, handle, anchorDate) => {
    e.stopPropagation();
    e.preventDefault();
    // "Due-only" task: has due_date but neither start nor end
    const isDueOnly = !assignment.start_date && !assignment.end_date && !!assignment.due_date;
    // "Start-only" task: has start_date but no end_date (occurs after a move-drag on a single-day task)
    const isStartOnly = !!assignment.start_date && !assignment.end_date;
    const dueOnlyResize =
      (handle === 'left' || handle === 'right') && isDueOnly;
    // Move-drag: only cap by end_date when set. Side-drag: treat missing end as due_date so edges cannot cross the due day on due-only tasks.
    const origStart = assignment.start_date || assignment.due_date;
    const origEnd =
      handle === 'move'
        ? assignment.end_date
        : (assignment.end_date || assignment.due_date);
    dragRef.current = {
      assignment,
      handle,
      origStart,
      origEnd,
      anchorDate: anchorDate || null,
      // A task is treated as "single-day" for move purposes only if it's due-only (no start/end)
      isSingleDay: isDueOnly,
    };
    if (handle === 'move' && isDueOnly) {
      setDragPreview({ id: assignment.id, start_date: null, end_date: null, _singleDayPos: assignment.due_date });
    } else if (dueOnlyResize) {
      // Side-drag from due-only pill: treat the due day as a 1-day range so handles match multi-day behavior
      const d = assignment.due_date;
      setDragPreview({ id: assignment.id, start_date: d, end_date: d });
    } else if (handle === 'left' || handle === 'right') {
      // Side-drag on a start-only or ranged task: initialise preview with current effective dates
      const effectStart = assignment.start_date || assignment.due_date;
      const effectEnd = assignment.end_date || assignment.due_date || effectStart;
      setDragPreview({ id: assignment.id, start_date: effectStart, end_date: effectEnd });
    } else {
      setDragPreview({ id: assignment.id, start_date: assignment.start_date, end_date: assignment.end_date });
    }

    const onMove = (ev) => {
      const clientX = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY;
      const date = clientXYToDate(clientX, clientY);
      if (!date || !dragRef.current) return;
      const { handle: h, origStart, origEnd, anchorDate: anchor } = dragRef.current;
      if (h === 'left') {
        // Don't allow start to pass end
        if (origEnd && date > origEnd) return;
        setDragPreview(p => ({ ...p, start_date: date }));
      } else if (h === 'right') {
        if (origStart && date < origStart) return;
        setDragPreview(p => ({ ...p, end_date: date }));
      } else if (h === 'move') {
        // Move whole range: shift start and end by the same delta (single-day: _singleDayPos only)
        if (!anchor || !origStart) return;
        const anchorMs = new Date(anchor + 'T00:00:00').getTime();
        const dateMs   = new Date(date   + 'T00:00:00').getTime();
        const deltaDays = Math.round((dateMs - anchorMs) / 86400000);
        const isSingle = dragRef.current?.isSingleDay;
        if (isSingle) {
          setDragPreview(p => ({ ...p, _singleDayPos: addCalendarDays(origStart, deltaDays) }));
        } else {
          const newStartStr = addCalendarDays(origStart, deltaDays);
          const asg = dragRef.current?.assignment;
          if (origEnd) {
            const newEndStr = addCalendarDays(origEnd, deltaDays);
            let due_date;
            if (asg?.due_date && origStart && origEnd
              && asg.due_date >= origStart && asg.due_date <= origEnd) {
              due_date = addCalendarDays(asg.due_date, deltaDays);
            }
            setDragPreview(p => ({
              ...p,
              start_date: newStartStr,
              end_date: newEndStr,
              ...(due_date ? { due_date } : {}),
            }));
          } else {
            setDragPreview(p => ({ ...p, start_date: newStartStr }));
          }
        }
      }
    };

    const onUp = async () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      if (!dragRef.current || !dragPreviewRef.current) return;
      const { assignment: a, handle: h, isSingleDay } = dragRef.current;
      const preview = dragPreviewRef.current;
      dragRef.current = null;
      setDragPreview(null);
      try {
        let payload;
        if (h === 'move') {
          if (isSingleDay) {
            // Single-day task: set start_date to the new position; due_date stays untouched
            const newPos = preview._singleDayPos;
            if (!newPos || newPos === a.due_date) return; // no-op if didn't move
            payload = { start_date: newPos };
          } else {
            const unchanged =
              preview.start_date === a.start_date
              && preview.end_date === a.end_date
              && (preview.due_date == null || preview.due_date === a.due_date);
            if (unchanged) return;
            payload = { start_date: preview.start_date, end_date: preview.end_date };
            if (preview.due_date != null) payload.due_date = preview.due_date;
          }
        } else {
          payload = { start_date: preview.start_date, end_date: preview.end_date };
          // Due-only task, user grabbed a side but did not change the implied range
          if (
            !a.start_date &&
            !a.end_date &&
            a.due_date &&
            preview.start_date === a.due_date &&
            preview.end_date === a.due_date
          ) {
            return;
          }
        }
        const updated = await updateAssignment(a.id, payload);
        setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, ...updated.data } : x));
      } catch {
        // revert silently — UI will snap back since dragPreview is cleared
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
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
      // If this single-day task is being dragged, also add it at the drag-target cell
      // so the pill renders at the cursor position during drag.
      const p = dragPreview && dragPreview.id === a.id ? dragPreview : null;
      if (p && p._singleDayPos && !p.start_date && !p.end_date && p._singleDayPos !== a.due_date) {
        if (!keys.includes(p._singleDayPos)) {
          (map[p._singleDayPos] = map[p._singleDayPos] || []).push(a);
        }
      }
    });
    return map;
  }, [visibleAssignments, dragPreview]);


  // Assignments for the selected day panel
  const selectedKey = selectedDay
    ? `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDay).padStart(2, '0')}`
    : null;
  const selectedItems = selectedKey
    ? (byDate[selectedKey] || []).slice().sort((a, b) => {
        // Completed tasks sink to the bottom
        const aDone = a.status === 'completed' ? 1 : 0;
        const bDone = b.status === 'completed' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        const as = a.start_date || a.due_date || '';
        const bs = b.start_date || b.due_date || '';
        return as.localeCompare(bs);
      })
    : [];

  const toggleComplete = async (a) => {
    const nextStatus = a.status === 'completed' ? 'pending' : 'completed';
    // Optimistic update
    setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, status: nextStatus } : x));
    try {
      await updateAssignment(a.id, { status: nextStatus });
    } catch {
      // Revert on failure
      setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, status: a.status } : x));
    }
  };

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
    <div className="page-enter">
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
                    {items.filter(a => a.status !== 'completed').map((a, idx) => {
                      // Course color takes priority; fall back to assignment-type palette
                      const typeCol = TYPE_COLORS[a.type] || TYPE_COLORS.other;
                      const dotColor  = a.course_color || typeCol.dot;
                      const bgColor   = a.course_color ? hexToRgba(a.course_color, 0.18) : typeCol.bg;
                      const textColor = a.course_color || typeCol.text;

                      // Resolve dates: dragPreview overrides if this assignment is being dragged
                      const preview = dragPreview && dragPreview.id === a.id ? dragPreview : null;
                      const effectiveStart = preview ? preview.start_date : a.start_date;
                      const effectiveEnd   = preview ? preview.end_date   : a.end_date;
                      const effectiveDue = preview?.due_date ?? a.due_date;
                      const isDue = effectiveDue === key;

                      // For single-day tasks being dragged, use _singleDayPos as the display date
                      const isSingleDayDrag = preview && preview._singleDayPos && !preview.start_date && !preview.end_date;
                      const displayKey = isSingleDayDrag ? preview._singleDayPos : key;

                      // Hide single-day pills that have moved away from this cell during drag
                      if (isSingleDayDrag && preview._singleDayPos !== key) return null;

                      // ── Spanning-bar geometry ─────────────────────────
                      const hasRange = !!(effectiveStart && effectiveEnd);
                      // "Due-only" pill: has a due date but no start or end range set
                      const isDueOnlyPill = !!(a.due_date && !a.start_date && !a.end_date);
                      // "Start-only" pill: has a start_date but no end_date (e.g. after a move-drag)
                      const isStartOnlyPill = !!(effectiveStart && !effectiveEnd);
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

                      // Allow dragging pill body when there's a start_date OR a due_date (single-day tasks)
                      const canMove = !!effectiveStart || !!a.due_date;

                      return (
                        <div
                          key={idx}
                          className="cal-event-pill"
                          style={{
                            ...pillStyle,
                            cursor: canMove ? (isDragging ? 'grabbing' : 'grab') : 'pointer',
                          }}
                          title={`${a.course_code ? a.course_code + ' · ' : ''}${a.title}${isDue ? ' ⚠ Due today!' : ''}`}
                          onClick={e => { e.stopPropagation(); setEditingAssignment(a); }}
                          onMouseDown={canMove ? (e => {
                            // Only trigger move-drag from the pill body (not the handles)
                            if (e.target.classList.contains('cal-pill-handle')) return;
                            startDrag(e, a, 'move', key);
                          }) : undefined}
                        >
                          {/* Left drag handle — start cell, due-only pill, or start-only pill */}
                          {capLeft && (
                            (hasRange && effectiveStart === key) ||
                            (isDueOnlyPill && a.due_date === key) ||
                            (isStartOnlyPill && effectiveStart === key)
                          ) && (
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
                          {/* Right drag handle — end cell, due-only pill, or start-only pill */}
                          {capRight && (
                            (hasRange && effectiveEnd === key) ||
                            (isDueOnlyPill && a.due_date === key) ||
                            (isStartOnlyPill && effectiveStart === key)
                          ) && (
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
                    const done = a.status === 'completed';
                    const accent = a.course_color || col.dot;

                    // ── Due-date badge (countdown always from real today) ──
                    const selectedDateMs = new Date(selectedKey + 'T00:00:00').getTime();
                    const nowMs = (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
                    const dueAnchor = a.due_date || a.end_date;
                    const dueMs = dueAnchor ? new Date(dueAnchor + 'T00:00:00').getTime() : null;
                    // Days from TODAY to due date (used for the label text)
                    const daysUntilDue = dueMs != null ? Math.round((dueMs - nowMs) / 86400000) : null;
                    // "Due today" = due date is literally today (not just the selected day)
                    const isDueToday = dueMs != null && dueMs === nowMs;
                    let dueLabel = null;
                    let dueUrgent = false;
                    if (!done && daysUntilDue != null) {
                      if (isDueToday) {
                        dueLabel = 'Due Today';
                        dueUrgent = true;
                      } else if (daysUntilDue === 1) {
                        dueLabel = 'Due Tomorrow';
                        dueUrgent = true;
                      } else if (daysUntilDue > 1) {
                        dueLabel = `Due in ${daysUntilDue} days`;
                      } else {
                        dueLabel = 'Overdue';
                        dueUrgent = true;
                      }
                    }

                    return (
                      <div
                        key={a.id}
                        className={`cal-side-item cal-side-item--clickable${done ? ' cal-side-item--done' : ''}${isDueToday && !done ? ' cal-side-item--due-today' : ''}`}
                        onClick={() => setEditingAssignment(a)}
                        title="Click to edit"
                      >
                        <button
                          type="button"
                          className={`cal-side-check${done ? ' checked' : ''}`}
                          style={done ? { background: accent, borderColor: accent } : { borderColor: accent }}
                          onClick={(e) => { e.stopPropagation(); toggleComplete(a); }}
                          title={done ? 'Mark as not done' : 'Mark as done'}
                        >
                          {done && <Check size={12} strokeWidth={3} />}
                        </button>
                        <div
                          className="cal-side-stripe"
                          style={{ background: accent }}
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
                            {dueLabel && (
                              <span
                                className={`cal-due-badge${daysUntilDue === 0 ? ' cal-due-badge--today' : dueUrgent ? ' cal-due-badge--urgent' : ''}`}
                              >
                                {dueLabel}
                              </span>
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
                    const now = new Date(); now.setHours(0, 0, 0, 0);
                    const startAnchor = a.start_date || a.due_date;
                    const refStart = startAnchor ? new Date(startAnchor + 'T00:00:00') : null;
                    const dueAnchor = a.due_date || a.end_date || a.start_date;
                    const refDue = new Date(dueAnchor + 'T00:00:00');
                    const diff = Math.round((refDue - now) / 86400000);
                    const label = diff === 0 ? 'Due today'
                      : diff === 1 ? 'Due tomorrow'
                        : diff > 0 ? `Due in ${diff} days`
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
                            <span style={{ color: urgent ? 'var(--warning)' : 'var(--text-muted)', fontSize: 11, fontWeight: urgent ? 600 : 400 }}>
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
          onDelete={(id) => setAssignments(prev => prev.filter(a => a.id !== id))}
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
