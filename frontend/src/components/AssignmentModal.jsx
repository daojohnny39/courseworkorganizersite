import { useState } from 'react';
import { X } from 'lucide-react';
import { createAssignment, updateAssignment, deleteAssignment } from '../api';
import { useToast } from '../context/ToastContext';
import DatePicker from './DatePicker';

const TYPES = ['homework', 'exam', 'quiz', 'project', 'lab', 'reading', 'other'];

export default function AssignmentModal({ assignment, courses, defaultCourseId, defaultDate, onClose, onSave, onDelete }) {
  const toast = useToast();
  const editing = !!assignment;

  const [form, setForm] = useState({
    course_id: assignment?.course_id ?? defaultCourseId ?? (courses[0]?.id ?? ''),
    title: assignment?.title ?? '',
    description: assignment?.description ?? '',
    type: assignment?.type ?? 'homework',
    start_date: assignment?.start_date ?? (defaultDate || ''),
    end_date: assignment?.end_date ?? '',
    due_date: assignment?.due_date ?? (defaultDate || ''),
    status: assignment?.status ?? 'pending',
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) return toast('Title is required', 'error');
    setLoading(true);
    try {
      let saved;
      const payload = {
        ...form,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
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
          <button className="btn btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
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

            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e => set('type', e.target.value)}>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <DatePicker value={form.start_date} onChange={v => set('start_date', v)} placeholder="Pick start date…" id="start-date-picker" />
              </div>
              <div className="form-group">
                <label className="form-label">End Date</label>
                <DatePicker value={form.end_date} onChange={v => set('end_date', v)} placeholder="Pick end date…" id="end-date-picker" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Due Date</label>
              <DatePicker value={form.due_date} onChange={v => set('due_date', v)} placeholder="Pick due date…" id="due-date-picker" />
            </div>

          </div>

          <div className="form-actions" style={{ padding: '0 24px 24px', justifyContent: 'space-between' }}>
            {editing ? (
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting || loading}
                onClick={async () => {
                  if (!window.confirm('Delete this assignment? This cannot be undone.')) return;
                  setDeleting(true);
                  try {
                    await deleteAssignment(assignment.id);
                    toast('Assignment deleted.', 'success');
                    onDelete?.(assignment.id);
                    onClose();
                  } catch {
                    toast('Failed to delete assignment', 'error');
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving…' : editing ? 'Save Changes' : 'Add Assignment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
