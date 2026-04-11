import { useState, useEffect } from 'react';
import { RefreshCw, ToggleLeft, ToggleRight, AlertTriangle, Link2, Unlink } from 'lucide-react';
import { icsGetStatus, icsConnect, icsDisconnect, icsSyncNow, icsExcludeCourse, icsIncludeCourse, icsUpdateSettings } from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { authMe } from '../api';

export default function CanvasSettings() {
  const { addToast } = useToast();
  const { login, token } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data } = await icsGetStatus();
      setStatus(data);
    } catch {
      addToast('Failed to load sync status', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const refreshAuthUser = async () => {
    try {
      const { data } = await authMe();
      login(token, data.user);
    } catch { /* ignore */ }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!icsUrl.trim()) return;
    setConnecting(true);
    try {
      const { data } = await icsConnect({ ics_url: icsUrl.trim() });
      addToast(`Connected! Found ${data.event_count} calendar events.`, 'success');
      setIcsUrl('');
      await refreshAuthUser();
      fetchStatus();
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to connect calendar feed', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect your calendar feed? Synced courses and assignments will remain, but auto-sync will stop.')) return;
    setDisconnecting(true);
    try {
      await icsDisconnect();
      addToast('Calendar feed disconnected', 'success');
      setStatus({ connected: false });
      await refreshAuthUser();
    } catch {
      addToast('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await icsSyncNow();
      addToast(
        `Synced: ${data.coursesCreated + data.coursesUpdated} courses, ${data.assignmentsCreated + data.assignmentsUpdated} assignments`,
        data.errors?.length ? 'warning' : 'success'
      );
      fetchStatus();
    } catch {
      addToast('Sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleToggleSync = async () => {
    try {
      await icsUpdateSettings({ sync_enabled: !status.sync_enabled });
      setStatus(prev => ({ ...prev, sync_enabled: !prev.sync_enabled }));
    } catch {
      addToast('Failed to update setting', 'error');
    }
  };

  const handleToggleCourse = async (courseMapId, currentlyExcluded) => {
    try {
      if (currentlyExcluded) {
        await icsIncludeCourse(courseMapId);
      } else {
        await icsExcludeCourse(courseMapId);
      }
      setStatus(prev => ({
        ...prev,
        courses: prev.courses.map(c =>
          c.id === courseMapId
            ? { ...c, excluded: currentlyExcluded ? 0 : 1 }
            : c
        ),
      }));
    } catch {
      addToast('Failed to update course', 'error');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: 28, height: 28,
          border: '3px solid rgba(99,102,241,0.3)',
          borderTopColor: 'var(--accent)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Not connected: show URL input ──
  if (!status?.connected) {
    return (
      <div style={{ padding: 32, maxWidth: 720 }}>
        <h2 style={{
          color: 'var(--text-primary)',
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 8,
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          Calendar Feed
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          Import your assignments from Canvas by connecting your calendar feed.
        </p>

        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '24px',
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
            Connect Calendar Feed
          </h3>

          <div style={{
            background: 'rgba(99,102,241,0.08)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: 10,
            padding: '14px 16px',
            marginBottom: 20,
          }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
              <strong>How to find your feed URL:</strong><br />
              In Canvas, go to <strong>Calendar</strong> and click the <strong>"Calendar Feed"</strong> button
              at the bottom right of the page. Copy the URL it gives you.
            </p>
          </div>

          <form onSubmit={handleConnect} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>
                Calendar Feed URL
              </label>
              <div style={{ position: 'relative' }}>
                <Link2 size={15} style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-muted)', pointerEvents: 'none',
                }} />
                <input
                  type="url"
                  required
                  value={icsUrl}
                  onChange={e => setIcsUrl(e.target.value)}
                  placeholder="https://school.instructure.com/feeds/calendars/user_XXXX.ics"
                  style={{
                    width: '100%',
                    padding: '10px 12px 10px 36px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                    transition: 'border-color var(--transition)',
                  }}
                  onFocus={e => e.target.style.borderColor = 'var(--border-focus)'}
                  onBlur={e => e.target.style.borderColor = 'var(--border)'}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={connecting || !icsUrl.trim()}
              style={{
                padding: '11px',
                background: (icsUrl.trim() && !connecting) ? 'var(--accent)' : 'rgba(99,102,241,0.4)',
                border: 'none',
                borderRadius: 10,
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: (icsUrl.trim() && !connecting) ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: (icsUrl.trim() && !connecting) ? '0 4px 16px rgba(99,102,241,0.4)' : 'none',
              }}
            >
              {connecting ? (
                <div style={{
                  width: 16, height: 16,
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
              ) : (
                <>
                  <Link2 size={16} />
                  Connect & Sync
                </>
              )}
            </button>
          </form>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Connected: show status & controls ──
  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      <h2 style={{
        color: 'var(--text-primary)',
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 24,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        Calendar Feed
      </h2>

      {/* Sync error alert */}
      {status.last_sync_error && (
        <div style={{
          background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={18} color="#f87171" />
          <div>
            <p style={{ color: '#f87171', fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
              Sync error
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{status.last_sync_error}</p>
          </div>
        </div>
      )}

      {/* Connection status card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '20px 24px',
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>Connection</h3>
          <span style={{
            fontSize: 12, fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 20,
            background: status.last_sync_error ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            color: status.last_sync_error ? '#f87171' : '#22c55e',
          }}>
            {status.last_sync_error ? 'Error' : 'Connected'}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>Last synced</span>
            <span style={{ color: 'var(--text-secondary)' }}>
              {status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : 'Never'}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>Auto-sync</span>
            <button onClick={handleToggleSync} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: status.sync_enabled ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              {status.sync_enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              flex: 1,
              padding: '10px',
              background: syncing ? 'rgba(99,102,241,0.4)' : 'var(--accent)',
              border: 'none',
              borderRadius: 10,
              color: '#fff',
              fontSize: 14,
              fontWeight: 600,
              cursor: syncing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            style={{
              padding: '10px 16px',
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 10,
              color: '#f87171',
              fontSize: 14,
              fontWeight: 600,
              cursor: disconnecting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Unlink size={14} />
            Disconnect
          </button>
        </div>
      </div>

      {/* Courses list */}
      {status.courses?.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '20px 24px',
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Imported Courses ({status.courses.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {status.courses.map(course => (
              <div
                key={course.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: course.excluded ? 'var(--bg-base)' : 'var(--bg-surface)',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  opacity: course.excluded ? 0.5 : 1,
                  transition: 'var(--transition)',
                }}
              >
                <p style={{
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  fontWeight: 500,
                }}>
                  {course.course_name}
                </p>
                <button
                  onClick={() => handleToggleCourse(course.id, course.excluded)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: course.excluded ? 'var(--text-muted)' : 'var(--accent)',
                  }}
                >
                  {course.excluded ? <ToggleLeft size={28} /> : <ToggleRight size={28} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
