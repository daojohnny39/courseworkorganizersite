import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, ClipboardList, LogOut, Menu, X, ChevronDown, Plus, Check, Trash2, ChevronLeft, Loader } from 'lucide-react';
import { useSemester } from '../context/SemesterContext';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/courses',     icon: BookOpen,        label: 'My Courses' },
  { to: '/assignments', icon: ClipboardList,   label: 'Assignments' },
];

const SEASONS = ['Spring', 'Summer', 'Fall', 'Winter'];
const BREAKPOINT = 1024;

// ── Semester Picker ────────────────────────────────────────────────
function SemesterPicker() {
  const { semesters, selected, selectSemester, addSemester, removeSemester } = useSemester();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('list'); // 'list' | 'add'
  const [newSeason, setNewSeason] = useState('Spring');
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const ref = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const openDropdown = () => {
    setView('list');
    setAddError('');
    setOpen(v => !v);
  };

  const handleSelect = (s) => {
    selectSemester(s);
    setOpen(false);
  };

  const handleAdd = async () => {
    setAdding(true);
    setAddError('');
    try {
      await addSemester(newSeason, newYear);
      setView('list');
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add semester');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (e, s) => {
    e.stopPropagation();
    try { await removeSemester(s.id); } catch {}
  };

  const label = selected ? `${selected.semester} ${selected.year}` : 'Select semester';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Trigger button */}
      <button
        onClick={openDropdown}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 12px',
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'background 0.15s, border-color 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.09)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
      >
        <span>{label}</span>
        <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 300,
        }}>
          {view === 'list' ? (
            <>
              {/* Semester list */}
              {semesters.length === 0 ? (
                <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
                  No semesters yet — add one below.
                </div>
              ) : (
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {semesters.map(s => {
                    const isSelected = selected?.id === s.id;
                    return (
                      <div
                        key={s.id}
                        onClick={() => handleSelect(s)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '9px 12px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--accent-surface)' : 'transparent',
                          color: isSelected ? 'var(--accent-light)' : 'var(--text-primary)',
                          fontSize: 13,
                          fontWeight: isSelected ? 600 : 400,
                          transition: 'background 0.12s',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Check size={13} style={{ opacity: isSelected ? 1 : 0, flexShrink: 0, color: 'var(--accent-light)' }} />
                        <span style={{ flex: 1 }}>{s.semester} {s.year}</span>
                        <button
                          onClick={(e) => handleDelete(e, s)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                            padding: 3, borderRadius: 4, opacity: 0.6,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = 1; }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.opacity = 0.6; }}
                          title="Remove semester"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add semester button */}
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => { setView('add'); setAddError(''); }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent-light)',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <Plus size={14} />
                  Add Semester
                </button>
              </div>
            </>
          ) : (
            // Add semester form
            <div style={{ padding: '14px 14px 12px' }}>
              {/* Back header */}
              <button
                onClick={() => setView('list')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
                  marginBottom: 14, padding: 0,
                }}
              >
                <ChevronLeft size={13} /> Back
              </button>

              {/* Season selector */}
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Season</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                  {SEASONS.map(s => (
                    <button
                      key={s}
                      onClick={() => setNewSeason(s)}
                      style={{
                        padding: '6px 0',
                        borderRadius: 6,
                        border: '1px solid',
                        borderColor: newSeason === s ? 'var(--accent)' : 'var(--border)',
                        background: newSeason === s ? 'var(--accent-surface)' : 'transparent',
                        color: newSeason === s ? 'var(--accent-light)' : 'var(--text-secondary)',
                        fontSize: 12,
                        fontWeight: newSeason === s ? 700 : 400,
                        cursor: 'pointer',
                        transition: 'all 0.12s',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Year input */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Year</label>
                <input
                  type="number"
                  value={newYear}
                  onChange={e => setNewYear(Number(e.target.value))}
                  min={2000}
                  max={2100}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    fontWeight: 600,
                    outline: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {addError && (
                <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 10 }}>{addError}</div>
              )}

              {/* Add button */}
              <button
                onClick={handleAdd}
                disabled={adding}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  borderRadius: 7,
                  border: 'none',
                  background: adding ? 'rgba(99,102,241,0.4)' : 'var(--accent)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: adding ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'background 0.15s',
                }}
              >
                {adding ? <Loader size={13} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Plus size={13} />}
                {adding ? 'Adding…' : `Add ${newSeason} ${newYear}`}
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────
export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(() => window.innerWidth > BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > BREAKPOINT) setIsOpen(true);
      else setIsOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleNavClick = () => {
    if (window.innerWidth <= BREAKPOINT) setIsOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.email ? user.email[0].toUpperCase() : '?';

  return (
    <>
      {/* Hamburger toggle */}
      <button
        className="sidebar-toggle"
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />
      )}

      <aside className={`sidebar${isOpen ? '' : ' sidebar--closed'}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🎓</div>
          <span className="sidebar-logo-text">CourseTrack</span>
        </div>

        <nav className="sidebar-nav">
          <span className="nav-section-label">Navigation</span>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              onClick={handleNavClick}
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Semester picker */}
          <div>
            <span className="nav-section-label" style={{ marginBottom: 6, display: 'block' }}>Semester</span>
            <SemesterPicker />
          </div>

          {/* User info + logout */}
          {user && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: 10,
              border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {user.email}
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                  padding: 4, borderRadius: 6, transition: 'color 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
