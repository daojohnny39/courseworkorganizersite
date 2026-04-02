const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all courses (scoped to logged-in user)
router.get('/', (req, res) => {
  try {
    const { semester, year } = req.query;
    let query = 'SELECT * FROM courses WHERE user_id = ?';
    const params = [req.user.id];

    if (semester) { query += ' AND semester = ?'; params.push(semester); }
    if (year)     { query += ' AND year = ?';     params.push(Number(year)); }

    query += ' ORDER BY created_at DESC';
    const courses = db.prepare(query).all(...params);
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single course with assignments (scoped to user)
router.get('/:id', (req, res) => {
  try {
    const course = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const assignments = db.prepare('SELECT * FROM assignments WHERE course_id = ? ORDER BY due_date ASC').all(req.params.id);
    res.json({ ...course, assignments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create course (attached to logged-in user)
router.post('/', (req, res) => {
  try {
    const { name, code, instructor, credits, color, semester, year, target_grade } = req.body;
    if (!name || !code || !semester || !year) {
      return res.status(400).json({ error: 'name, code, semester, and year are required' });
    }
    const result = db.prepare(
      'INSERT INTO courses (user_id, name, code, instructor, credits, color, semester, year, target_grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.user.id, name, code, instructor || null, credits || 3, color || '#6366f1', semester, year, target_grade || 'A');

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update course (scoped to user)
router.put('/:id', (req, res) => {
  try {
    const { name, code, instructor, credits, color, semester, year, grade, target_grade } = req.body;
    const existing = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Course not found' });

    db.prepare(
      `UPDATE courses SET name=?, code=?, instructor=?, credits=?, color=?, semester=?, year=?, grade=?, target_grade=? WHERE id=?`
    ).run(
      name ?? existing.name,
      code ?? existing.code,
      instructor ?? existing.instructor,
      credits ?? existing.credits,
      color ?? existing.color,
      semester ?? existing.semester,
      year ?? existing.year,
      grade !== undefined ? grade : existing.grade,
      target_grade ?? existing.target_grade,
      req.params.id
    );

    const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE course (scoped to user)
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM courses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Course not found' });
    db.prepare('DELETE FROM courses WHERE id = ?').run(req.params.id);
    res.json({ message: 'Course deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
