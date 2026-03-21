import { useState } from 'react';
import { X } from 'lucide-react';
import { createAssignment, updateAssignment } from '../api';
import { useToast } from '../context/ToastContext';

const TYPES   = ['homework','exam','quiz','project','lab','reading','other'];
const STATUSES = ['pending','in-progress','completed','missed'];

export default function AssignmentModal({ assignment, courses, defaultCourseId, onClose, onSave }) {
  const toast = useToast();
  const editing = !!assignment;

  const [form, setForm] = useState({
    course_id:   assignment?.course_id   ?? defaultCourseId ?? (courses[0]?.id ?? ''),
    title:       assignment?.title       ?? '',
    description: assignment?.description ?? '',
    type:        assignment?.type        ?? 'homework',
    due_date:    assignment?.due_date    ?? '',
    status:      assignment?.status      ?? 'pending',
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) return toast('Title is required', 'error');
    setLoading(true);
    try {
      let saved;
      const payload = {
        ...form,
        due_date: form.due_date || null,
      };
      if (editing) {
        const { data } = await updateAssignment(assignment.id, payload);
        saved = data;
      } else {
        const { data } = await createAssignment(payload);
        saved = data;
      }
      toast(editing ? 'Assignment updated!' : 'Assignment added!', 'success');
      onSave(saved);
    } catch {
      toast('Failed to save assignment', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">{editing ? 'Edit Assignment' : 'Add Assignment'}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18}/></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {!defaultCourseId && (
              <div className="form-group">
                <label className="form-label">Course *</label>
                <select className="form-select" value={form.course_id} onChange={e => set('course_id', e.target.value)} required>
                  <option value="">Select course…</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.code} – {c.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" placeholder="Midterm Exam" value={form.title} onChange={e => set('title', e.target.value)} required />
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" placeholder="Any notes about this assignment…" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
                  {TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select className="form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input className="form-input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
            </div>

          </div>

          <div className="form-actions" style={{ padding: '0 24px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : editing ? 'Save Changes' : 'Add Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
