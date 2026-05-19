import { useEffect, useState } from 'react';
import { Plus, Search, Check, Pencil, Trash2, Clock } from 'lucide-react';
import { getAssignments, getCourses, deleteAssignment, updateAssignment } from '../api';
import AssignmentModal from '../components/AssignmentModal';
import { useToast } from '../context/ToastContext';
import { useSemester } from '../context/SemesterContext';

function getDueInfo(dateStr, status) {
  if (!dateStr || status === 'completed') return null;
  const due  = new Date(dateStr + 'T23:59:59');
  const diff = Math.ceil((due - new Date()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: 'overdue' };
  if (diff === 0) return { label: 'Due today',   cls: 'due-soon' };
  if (diff === 1) return { label: 'Tomorrow',    cls: 'due-soon' };
  return { label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), cls: '' };
}

export default function Assignments() {
  const toast = useToast();
  const { semester, year } = useSemester();
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('all');
  const [modal, setModal]     = useState(null);

  const loadAll = () => {
    setLoading(true);
    Promise.all([getAssignments({ semester, year }), getCourses({ semester, year })])
      .then(([{ data: a }, { data: c }]) => { setAssignments(a); setCourses(c); })
      .finally(() => setLoading(false));
  };

  useEffect(loadAll, [semester, year]);

  const toggleComplete = async (a) => {
    const ns = a.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateAssignment(a.id, { status: ns });
      setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, status: ns } : x));
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

  const handleSave = (saved) => {
    setAssignments(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) {
        const course = courses.find(c => c.id === saved.course_id);
        const merged = { ...saved, course_name: course?.name, course_code: course?.code, course_color: course?.color };
        return prev.map(a => a.id === saved.id ? merged : a);
      }
      const course = courses.find(c => c.id === saved.course_id);
      return [...prev, { ...saved, course_name: course?.name, course_code: course?.code, course_color: course?.color }];
    });
    setModal(null);
  };

  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'exam', label: 'Exams' },
    { key: 'homework', label: 'Homework' },
    { key: 'project', label: 'Projects' },
  ];

  const today = new Date();

  const filtered = assignments.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = a.title.toLowerCase().includes(q)
      || (a.course_name || '').toLowerCase().includes(q)
      || (a.course_code || '').toLowerCase().includes(q);
    if (!matchSearch) return false;

    if (filter === 'all')       return true;
    if (filter === 'pending')   return a.status === 'pending' || a.status === 'in-progress';
    if (filter === 'completed') return a.status === 'completed';
    if (filter === 'overdue') {
      if (!a.due_date || a.status === 'completed') return false;
      return new Date(a.due_date + 'T23:59:59') < today;
    }
    return a.type === filter;
  });

  if (loading) return <div className="loading-screen"><div className="spinner" /><span>Loading assignments…</span></div>;

  return (
    <div className="page-enter">
      <div className="page-header">
        <h1 className="page-title">Assignments</h1>
        <p className="page-subtitle">{semester} {year} — All your assignments across every course.</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-input-wrapper">
            <Search size={15} className="search-icon" />
            <input className="form-input search-input" placeholder="Search assignments…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <button id="add-assignment-btn" className="btn btn-primary" onClick={() => setModal('add')}>
          <Plus size={16} /> Add Assignment
        </button>
      </div>

      <div className="tabs">
        {FILTERS.map(f => (
          <button key={f.key} className={`tab${filter===f.key?' active':''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <h3>{search ? 'No assignments match' : 'No assignments'}</h3>
          <p>{search ? 'Try a different search.' : 'Add your first assignment!'}</p>
          {!search && courses.length > 0 && (
            <button className="btn btn-primary" onClick={() => setModal('add')}><Plus size={16}/>Add Assignment</button>
          )}
          {!search && courses.length === 0 && <p style={{color:'var(--warning)'}}>Add a course first!</p>}
        </div>
      ) : (
        <div className="assignment-list stagger-children">
          {filtered.map(a => {
            const due = getDueInfo(a.due_date, a.status);
            return (
              <div key={a.id} className="assignment-item">
                <button
                  className={`assignment-check${a.status==='completed'?' checked':''}`}
                  onClick={() => toggleComplete(a)}
                >
                  {a.status === 'completed' && <Check size={11} color="#fff" />}
                </button>
                <div className="assignment-info">
                  <div className={`assignment-title${a.status==='completed'?' completed':''}`}>{a.title}</div>
                  <div className="assignment-meta">
                    {a.course_code && (
                      <span style={{ fontWeight: 600, fontSize: 12, color: a.course_color || 'var(--accent-light)' }}>
                        {a.course_code}
                      </span>
                    )}
                    <span className={`type-badge type-${a.type}`}>{a.type}</span>
                    {due && (
                      <span className={`assignment-due ${due.cls}`}>
                        <Clock size={11} />{due.label}
                      </span>
                    )}
                  </div>
                </div>
                <button className="btn btn-ghost btn-icon" onClick={() => setModal(a)}><Pencil size={13}/></button>
                <button className="btn btn-danger btn-icon" onClick={() => handleDelete(a)}><Trash2 size={13}/></button>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <AssignmentModal
          assignment={modal === 'add' ? null : modal}
          courses={courses}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
