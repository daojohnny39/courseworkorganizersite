const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all assignments (scoped to user via courses join)
router.get('/', (req, res) => {
  try {
    const { course_id, status, upcoming, semester, year } = req.query;
    let query = `
      SELECT a.*, c.name as course_name, c.code as course_code, c.color as course_color
      FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE c.user_id = ?
    `;
    const params = [req.user.id];

    if (course_id) { query += ' AND a.course_id = ?'; params.push(course_id); }
    if (status)    { query += ' AND a.status = ?';    params.push(status); }
    if (semester)  { query += ' AND c.semester = ?';  params.push(semester); }
    if (year)      { query += ' AND c.year = ?';      params.push(Number(year)); }
    if (upcoming === 'true') {
      query += ' AND a.due_date >= date("now") AND a.status != "completed"';
    }

    query += ' ORDER BY COALESCE(a.start_date, a.due_date) ASC';
    const assignments = db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single assignment (scoped to user)
router.get('/:id', (req, res) => {
  try {
    const assignment = db.prepare(`
      SELECT a.*, c.name as course_name, c.code as course_code, c.color as course_color
      FROM assignments a JOIN courses c ON a.course_id = c.id
      WHERE a.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create assignment (course must belong to user)
router.post('/', (req, res) => {
  try {
    const { course_id, title, description, type, start_date, end_date, due_date, max_grade, weight } = req.body;
    if (!course_id || !title) {
      return res.status(400).json({ error: 'course_id and title are required' });
    }
    // Verify the course belongs to the user
    const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(course_id, req.user.id);
    if (!course) return res.status(403).json({ error: 'Course not found' });

    const result = db.prepare(
      'INSERT INTO assignments (course_id, title, description, type, start_date, end_date, due_date, max_grade, weight) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(course_id, title, description || null, type || 'homework', start_date || null, end_date || null, due_date || null, max_grade || 100, weight || 0);

    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update assignment (scoped to user)
router.put('/:id', (req, res) => {
  try {
    const { title, description, type, start_date, end_date, due_date, grade, max_grade, weight, status } = req.body;
    const existing = db.prepare(`
      SELECT a.* FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE a.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    db.prepare(
      `UPDATE assignments SET title=?, description=?, type=?, start_date=?, end_date=?, due_date=?, grade=?, max_grade=?, weight=?, status=? WHERE id=?`
    ).run(
      title ?? existing.title,
      description ?? existing.description,
      type ?? existing.type,
      start_date !== undefined ? (start_date || null) : existing.start_date,
      end_date !== undefined ? (end_date || null) : existing.end_date,
      due_date !== undefined ? (due_date || null) : existing.due_date,
      grade !== undefined ? grade : existing.grade,
      max_grade ?? existing.max_grade,
      weight ?? existing.weight,
      status ?? existing.status,
      req.params.id
    );

    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE assignment (scoped to user)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare(`
      SELECT a.id FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE a.id = ? AND c.user_id = ?
    `).get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });
    db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
