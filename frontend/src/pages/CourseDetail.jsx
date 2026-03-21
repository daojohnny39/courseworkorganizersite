import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, Check, Clock } from 'lucide-react';
import { getCourse, deleteAssignment, updateAssignment } from '../api';
import AssignmentModal from '../components/AssignmentModal';
import CourseModal from '../components/CourseModal';
import { useToast } from '../context/ToastContext';

function getDueInfo(dateStr, status) {
  if (!dateStr) return null;
  const due  = new Date(dateStr + 'T23:59:59');
  const now  = new Date();
  const diff = Math.ceil((due - now) / 86400000);
  if (status === 'completed') return null;
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'overdue' };
  if (diff === 0) return { label: 'Due today', cls: 'due-soon' };
  if (diff === 1) return { label: 'Tomorrow',  cls: 'due-soon' };
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' };
}


export default function CourseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [course, setCourse] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState(null);
  const [editCourse, setEditCourse] = useState(false);

  const load = () => {
    getCourse(id)
      .then(({ data }) => {
        setCourse(data);
        setAssignments(data.assignments || []);
      })
      .catch(() => { toast('Course not found', 'error'); navigate('/courses'); })
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const toggleComplete = async (a) => {
    const newStatus = a.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateAssignment(a.id, { status: newStatus });
      setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, status: newStatus } : x));
    } catch { toast('Failed to update', 'error'); }
  };

  const handleDelete = async (a) => {
    if (!confirm(`Delete "${a.title}"?`)) return;
    try {
      await deleteAssignment(a.id);
      setAssignments(prev => prev.filter(x => x.id !== a.id));
      toast('Assignment deleted', 'success');
    } catch { toast('Failed to delete', 'error'); }
  };

  const handleSaveAssignment = (saved) => {
    setAssignments(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) return prev.map(a => a.id === saved.id ? saved : a);
      return [...prev, saved];
    });
    setModal(null);
  };

  const handleSaveCourse = (saved) => { setCourse(saved); setEditCourse(false); };

  if (loading) return <div className="loading-screen"><div className="spinner" /><span>Loading course…</span></div>;
  if (!course) return null;

  const filtered = filter === 'all'
    ? assignments
    : assignments.filter(a => a.status === filter || a.type === filter);

  const completed = assignments.filter(a => a.status === 'completed').length;

  return (
    <div className="fade-in">
      {/* Back + Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/courses')} style={{ marginTop: 4 }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: course.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: course.color }}>
              {course.code}
            </span>
          </div>
          <h1 className="page-title" style={{ marginBottom: 2 }}>{course.name}</h1>
          <p className="page-subtitle">{course.instructor || 'No instructor'} · {course.semester} {course.year} · {course.credits} credits</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setEditCourse(true)}><Pencil size={14}/> Edit</button>
          <button id="add-assignment-btn" className="btn btn-primary btn-sm" onClick={() => setModal('add')}><Plus size={14}/> Add Assignment</button>
        </div>
      </div>

      {/* Mini Stats */}
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', marginBottom: 20 }}>
        <div className="stat-card card-sm">
          <div className="stat-label">Assignments</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{assignments.length}</div>
        </div>
        <div className="stat-card card-sm">
          <div className="stat-label">Completed</div>
          <div className="stat-value" style={{ fontSize: 22 }}>{completed}</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="tabs">
        {['all','pending','completed','exam','homework','project','quiz'].map(f => (
          <button key={f} className={`tab${filter===f?' active':''}`} onClick={() => setFilter(f)}>
            {f.charAt(0).toUpperCase()+f.slice(1)}
          </button>
        ))}
      </div>

      {/* Assignment List */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <h3>No assignments here</h3>
          <p>Add an assignment to start tracking your work.</p>
          <button className="btn btn-primary" onClick={() => setModal('add')}><Plus size={16}/>Add Assignment</button>
        </div>
      ) : (
        <div className="assignment-list">
          {filtered.map(a => {
            const due = getDueInfo(a.due_date, a.status);
            return (
              <div key={a.id} className="assignment-item">
                <button
                  className={`assignment-check${a.status === 'completed' ? ' checked' : ''}`}
                  onClick={() => toggleComplete(a)}
                  title="Toggle complete"
                >
                  {a.status === 'completed' && <Check size={11} color="#fff" />}
                </button>
                <div className="assignment-info">
                  <div className={`assignment-title${a.status === 'completed' ? ' completed' : ''}`}>{a.title}</div>
                  <div className="assignment-meta">
                    <span className={`type-badge type-${a.type}`}>{a.type}</span>
                    {due && (
                      <span className={`assignment-due ${due.cls}`}>
                        <Clock size={11} />{due.label}
                      </span>
                    )}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setModal(a)} title="Edit"><Pencil size={13}/></button>
                <button className="btn btn-danger btn-icon" onClick={() => handleDelete(a)} title="Delete"><Trash2 size={13}/></button>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <AssignmentModal
          assignment={modal === 'add' ? null : modal}
          courses={[course]}
          defaultCourseId={course.id}
          onClose={() => setModal(null)}
          onSave={handleSaveAssignment}
        />
      )}

      {editCourse && (
        <CourseModal
          course={course}
          onClose={() => setEditCourse(false)}
          onSave={handleSaveCourse}
        />
      )}
    </div>
  );
}
