import { useState, useEffect } from 'react';
import { RefreshCw, ToggleLeft, ToggleRight, ExternalLink, AlertTriangle } from 'lucide-react';
import { canvasGetStatus, canvasSyncNow, canvasExcludeCourse, canvasIncludeCourse, canvasUpdateSettings } from '../api';
import { useToast } from '../context/ToastContext';

export default function CanvasSettings() {
  const { addToast } = useToast();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchStatus = async () => {
    try {
      const { data } = await canvasGetStatus();
      setStatus(data);
    } catch {
      addToast('Failed to load Canvas status', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data } = await canvasSyncNow();
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
      await canvasUpdateSettings({ sync_enabled: !status.sync_enabled });
      setStatus(prev => ({ ...prev, sync_enabled: !prev.sync_enabled }));
    } catch {
      addToast('Failed to update setting', 'error');
    }
  };

  const handleToggleCourse = async (canvasCourseId, currentlyExcluded) => {
    try {
      if (currentlyExcluded) {
        await canvasIncludeCourse(canvasCourseId);
      } else {
        await canvasExcludeCourse(canvasCourseId);
      }
      setStatus(prev => ({
        ...prev,
        courses: prev.courses.map(c =>
          c.canvas_course_id === canvasCourseId
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

  if (!status?.connected) {
    return (
      <div style={{ padding: 32 }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: 12 }}>Canvas Integration</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          No Canvas account connected. Register with Canvas from the login page to enable this feature.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 720 }}>
      <h2 style={{
        color: 'var(--text-primary)',
        fontSize: 22,
        fontWeight: 700,
        marginBottom: 24,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        Canvas Integration
      </h2>

      {/* Token error alert */}
      {status.token_error && (
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
              Canvas connection error
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{status.token_error}</p>
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
            background: status.token_error ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.15)',
            color: status.token_error ? '#f87171' : '#22c55e',
          }}>
            {status.token_error ? 'Error' : 'Connected'}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span style={{ color: 'var(--text-muted)' }}>Instance</span>
            <a href={status.canvas_instance_url} target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent-light)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              {status.canvas_instance_url.replace(/^https?:\/\//, '')}
              <ExternalLink size={12} />
            </a>
          </div>
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

        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            marginTop: 18,
            width: '100%',
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
      </div>

      {/* Canvas courses list */}
      {status.courses?.length > 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '20px 24px',
        }}>
          <h3 style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
            Canvas Courses ({status.courses.length})
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {status.courses.map(course => (
              <div
                key={course.canvas_course_id}
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
                <div>
                  <p style={{
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontWeight: 500,
                  }}>
                    {course.canvas_course_name}
                  </p>
                  {course.canvas_enrollment_term && (
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>
                      {course.canvas_enrollment_term}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleToggleCourse(course.canvas_course_id, course.excluded)}
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
