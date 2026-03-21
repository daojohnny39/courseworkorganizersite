import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { getCourses, deleteCourse } from '../api';
import CourseModal from '../components/CourseModal';
import { useToast } from '../context/ToastContext';


export default function Courses() {
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'add' | courseObject

  const load = () => {
    getCourses()
      .then(({ data }) => setCourses(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleDelete = async (course) => {
    if (!confirm(`Delete "${course.name}"? All assignments will also be removed.`)) return;
    try {
      await deleteCourse(course.id);
      setCourses(cs => cs.filter(c => c.id !== course.id));
      toast('Course deleted', 'success');
    } catch {
      toast('Failed to delete course', 'error');
    }
  };

  const handleSave = (saved) => {
    setCourses(cs => {
      const idx = cs.findIndex(c => c.id === saved.id);
      if (idx >= 0) return cs.map(c => c.id === saved.id ? saved : c);
      return [saved, ...cs];
    });
    setModal(null);
  };

  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase()) ||
    (c.instructor || '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="loading-screen"><div className="spinner" /><span>Loading courses…</span></div>;

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1 className="page-title">My Courses</h1>
        <p className="page-subtitle">Manage all your enrolled courses.</p>
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <div className="search-input-wrapper">
            <Search size={15} className="search-icon" />
            <input
              className="form-input search-input"
              placeholder="Search courses…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <button id="add-course-btn" className="btn btn-primary" onClick={() => setModal('add')}>
            <Plus size={16} /> Add Course
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <h3>{search ? 'No courses match your search' : 'No courses yet'}</h3>
          <p>{search ? 'Try a different search term.' : 'Add your first course to get started!'}</p>
          {!search && <button className="btn btn-primary" onClick={() => setModal('add')}><Plus size={16}/>Add First Course</button>}
        </div>
      ) : (
        <div className="courses-grid">
          {filtered.map(course => (
            <div key={course.id} className="course-card" style={{ position: 'relative' }}>
              <div className="course-card-header" style={{ background: course.color }} />
              <div className="course-card-body">
                <span className="course-code" style={{ color: course.color }}>{course.code}</span>
                <Link to={`/courses/${course.id}`} style={{ textDecoration: 'none' }}>
                  <h3 className="course-name">{course.name}</h3>
                </Link>
                <p className="course-instructor">{course.instructor || 'No instructor set'}</p>

                <div className="course-meta">
                  <span className="course-badge">{course.semester} {course.year}</span>
                  <span className="course-badge">{course.credits} cr</span>
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
                  <Link to={`/courses/${course.id}`} className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }}>
                    View
                  </Link>
                  <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setModal(course)} title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button className="btn btn-danger btn-icon btn-sm" onClick={() => handleDelete(course)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <CourseModal
          course={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
