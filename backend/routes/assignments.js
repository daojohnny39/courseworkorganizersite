const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all assignments (optionally filtered by course)
router.get('/', (req, res) => {
  try {
    const { course_id, status, upcoming } = req.query;
    let query = `
      SELECT a.*, c.name as course_name, c.code as course_code, c.color as course_color
      FROM assignments a
      JOIN courses c ON a.course_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (course_id) { query += ' AND a.course_id = ?'; params.push(course_id); }
    if (status) { query += ' AND a.status = ?'; params.push(status); }
    if (upcoming === 'true') {
      query += ' AND a.due_date >= date("now") AND a.status != "completed"';
    }

    query += ' ORDER BY a.due_date ASC';
    const assignments = db.prepare(query).all(...params);
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single assignment
router.get('/:id', (req, res) => {
  try {
    const assignment = db.prepare(`
      SELECT a.*, c.name as course_name, c.code as course_code, c.color as course_color
      FROM assignments a JOIN courses c ON a.course_id = c.id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found' });
    res.json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create assignment
router.post('/', (req, res) => {
  try {
    const { course_id, title, description, type, due_date, max_grade, weight } = req.body;
    if (!course_id || !title) {
      return res.status(400).json({ error: 'course_id and title are required' });
    }
    const result = db.prepare(
      'INSERT INTO assignments (course_id, title, description, type, due_date, max_grade, weight) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(course_id, title, description || null, type || 'homework', due_date || null, max_grade || 100, weight || 0);

    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(assignment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update assignment
router.put('/:id', (req, res) => {
  try {
    const { title, description, type, due_date, grade, max_grade, weight, status } = req.body;
    const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });

    db.prepare(
      `UPDATE assignments SET title=?, description=?, type=?, due_date=?, grade=?, max_grade=?, weight=?, status=? WHERE id=?`
    ).run(
      title ?? existing.title,
      description ?? existing.description,
      type ?? existing.type,
      due_date ?? existing.due_date,
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

// DELETE assignment
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Assignment not found' });
    db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
    res.json({ message: 'Assignment deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
