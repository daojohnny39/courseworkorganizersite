import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, BookOpen, ClipboardList, ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { useSemester, getSemesterOptions } from '../context/SemesterContext';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/courses',     icon: BookOpen,        label: 'My Courses' },
  { to: '/assignments', icon: ClipboardList,   label: 'Assignments' },
];

const SEMESTER_OPTIONS = getSemesterOptions();
const BREAKPOINT = 1024;

export default function Sidebar() {
  const { semester, year, setSemester } = useSemester();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(() => window.innerWidth > BREAKPOINT);

  // Auto-collapse when window shrinks below breakpoint, re-open when it grows above
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > BREAKPOINT) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close sidebar on nav (mobile only)
  const handleNavClick = () => {
    if (window.innerWidth <= BREAKPOINT) setIsOpen(false);
  };

  const handleSemesterChange = (e) => {
    const [s, y] = e.target.value.split('|');
    setSemester({ semester: s, year: Number(y) });
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.email ? user.email[0].toUpperCase() : '?';
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= BREAKPOINT;

  return (
    <>
      {/* Hamburger toggle button — always rendered, hidden on desktop via CSS */}
      <button
        className="sidebar-toggle"
        onClick={() => setIsOpen(v => !v)}
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Backdrop overlay (mobile only, when open) */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
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
          {/* Semester selector */}
          <div>
            <span className="nav-section-label" style={{ marginBottom: 6, display: 'block' }}>Semester</span>
            <div style={{ position: 'relative' }}>
              <select
                value={`${semester}|${year}`}
                onChange={handleSemesterChange}
                style={{
                  width: '100%',
                  background: 'var(--surface-2, rgba(255,255,255,0.06))',
                  border: '1px solid var(--border, rgba(255,255,255,0.1))',
                  borderRadius: 8,
                  color: 'var(--text-primary, #f1f5f9)',
                  fontSize: 13,
                  fontWeight: 600,
                  padding: '7px 30px 7px 10px',
                  appearance: 'none',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                {SEMESTER_OPTIONS.map(({ semester: s, year: y, label }) => (
                  <option key={label} value={`${s}|${y}`} style={{ background: '#1e293b', color: '#f1f5f9' }}>
                    {label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{
                  position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                  pointerEvents: 'none', color: 'var(--text-muted, #94a3b8)',
                }}
              />
            </div>
          </div>

          {/* User info + logout */}
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
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
                  fontSize: 12, fontWeight: 600,
                  color: 'var(--text-primary)',
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
                  color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'center', padding: 4, borderRadius: 6,
                  transition: 'color 0.15s', flexShrink: 0,
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
