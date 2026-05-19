const express = require('express');
const router = express.Router();
const db = require('../db');

const EVENT_SELECT = `
  SELECT e.*, c.name as course_name, c.code as course_code, c.color as course_color
  FROM events e
  LEFT JOIN courses c ON e.course_id = c.id
`;

// GET /api/events — list events for current user, filtered by semester/year
router.get('/', (req, res) => {
  try {
    const { semester, year } = req.query;
    let query = `${EVENT_SELECT} WHERE e.user_id = ?`;
    const params = [req.user.id];

    if (semester) { query += ' AND e.semester = ?'; params.push(semester); }
    if (year)     { query += ' AND e.year = ?';     params.push(Number(year)); }

    query += ' ORDER BY e.start_time ASC, e.created_at ASC';
    res.json(db.prepare(query).all(...params));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/events — create event
router.post('/', (req, res) => {
  try {
    const {
      course_id, semester, year, title, location, type,
      days_of_week, start_time, end_time, start_date, end_date, notes, color,
    } = req.body;

    if (!title || !semester || !year) {
      return res.status(400).json({ error: 'title, semester, and year are required' });
    }

    if (course_id) {
      const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(course_id, req.user.id);
      if (!course) return res.status(403).json({ error: 'Course not found' });
    }

    const result = db.prepare(`
      INSERT INTO events
        (user_id, course_id, semester, year, title, location, type, days_of_week,
         start_time, end_time, start_date, end_date, notes, color)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id, course_id || null, semester, Number(year), title,
      location || null, type || 'class', days_of_week || null,
      start_time || null, end_time || null,
      start_date || null, end_date || null,
      notes || null, color || null,
    );

    const event = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(result.lastInsertRowid);
    res.status(201).json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/events/:id — update event
router.put('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM events WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });

    const {
      course_id, title, location, type,
      days_of_week, start_time, end_time, start_date, end_date, notes, color,
    } = req.body;

    if (course_id != null) {
      const course = db.prepare('SELECT id FROM courses WHERE id = ? AND user_id = ?').get(course_id, req.user.id);
      if (!course) return res.status(403).json({ error: 'Course not found' });
    }

    db.prepare(`
      UPDATE events SET
        course_id=?, title=?, location=?, type=?,
        days_of_week=?, start_time=?, end_time=?,
        start_date=?, end_date=?, notes=?, color=?
      WHERE id=?
    `).run(
      course_id !== undefined ? (course_id || null) : existing.course_id,
      title ?? existing.title,
      location !== undefined ? (location || null) : existing.location,
      type ?? existing.type,
      days_of_week !== undefined ? (days_of_week || null) : existing.days_of_week,
      start_time !== undefined ? (start_time || null) : existing.start_time,
      end_time !== undefined ? (end_time || null) : existing.end_time,
      start_date !== undefined ? (start_date || null) : existing.start_date,
      end_date !== undefined ? (end_date || null) : existing.end_date,
      notes !== undefined ? (notes || null) : existing.notes,
      color !== undefined ? (color || null) : existing.color,
      req.params.id,
    );

    const event = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(req.params.id);
    res.json(event);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/events/:id — delete event
router.delete('/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT id FROM events WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!existing) return res.status(404).json({ error: 'Event not found' });
    db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
