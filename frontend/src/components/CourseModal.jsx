import { useState } from 'react';
import { X } from 'lucide-react';
import { createCourse, updateCourse } from '../api';
import { useToast } from '../context/ToastContext';

const COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

const SEMESTERS = ['Spring', 'Summer', 'Fall', 'Winter'];

export default function CourseModal({ course, onClose, onSave }) {
  const toast = useToast();
  const editing = !!course;

  const [form, setForm] = useState({
    name:       course?.name       ?? '',
    code:       course?.code       ?? '',
    instructor: course?.instructor ?? '',
    credits:    course?.credits    ?? 3,
    color:      course?.color      ?? '#6366f1',
    semester:   course?.semester   ?? 'Spring',
    year:       course?.year       ?? new Date().getFullYear(),
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.code) return toast('Name and code are required', 'error');
    setLoading(true);
    try {
      let saved;
      if (editing) {
        const { data } = await updateCourse(course.id, form);
        saved = data;
      } else {
        const { data } = await createCourse(form);
        saved = data;
      }
      toast(editing ? 'Course updated!' : 'Course created!', 'success');
      onSave(saved);
    } catch {
      toast('Failed to save course', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{editing ? 'Edit Course' : 'Add New Course'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Course Name *</label>
                <input className="form-input" placeholder="Introduction to CS" value={form.name} onChange={e => set('name', e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Course Code *</label>
                <input className="form-input" placeholder="CS 101" value={form.code} onChange={e => set('code', e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Instructor</label>
              <input className="form-input" placeholder="Prof. Smith" value={form.instructor} onChange={e => set('instructor', e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Semester</label>
                <select className="form-select" value={form.semester} onChange={e => set('semester', e.target.value)}>
                  {SEMESTERS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Year</label>
                <input className="form-input" type="number" min="2020" max="2030" value={form.year} onChange={e => set('year', +e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Credits</label>
                <input className="form-input" type="number" min="1" max="6" value={form.credits} onChange={e => set('credits', +e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Color</label>
              <div className="color-picker">
                {COLORS.map(c => (
                  <div
                    key={c}
                    className={`color-swatch${form.color === c ? ' selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => set('color', c)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="form-actions" style={{ padding: '0 24px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : editing ? 'Save Changes' : 'Add Course'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
