const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all semesters for the logged-in user, newest year/season first
router.get('/', (req, res) => {
  try {
    const rows = db.prepare(
      `SELECT * FROM semesters WHERE user_id = ?
       ORDER BY year DESC,
         CASE semester
           WHEN 'Fall'   THEN 1
           WHEN 'Summer' THEN 2
           WHEN 'Spring' THEN 3
           WHEN 'Winter' THEN 4
           ELSE 5
         END`
    ).all(req.user.id);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST add a semester
router.post('/', (req, res) => {
  try {
    const { semester, year } = req.body;
    if (!semester || !year) {
      return res.status(400).json({ error: 'semester and year are required' });
    }
    const VALID = ['Spring', 'Summer', 'Fall', 'Winter'];
    if (!VALID.includes(semester)) {
      return res.status(400).json({ error: `semester must be one of: ${VALID.join(', ')}` });
    }
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      return res.status(400).json({ error: 'year must be an integer between 2000 and 2100' });
    }

    try {
      const result = db.prepare(
        'INSERT INTO semesters (user_id, semester, year) VALUES (?, ?, ?)'
      ).run(req.user.id, semester, y);
      const row = db.prepare('SELECT * FROM semesters WHERE id = ?').get(result.lastInsertRowid);
      res.status(201).json(row);
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'That semester is already in your list' });
      }
      throw e;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE a semester
router.delete('/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM semesters WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Semester not found' });
    db.prepare('DELETE FROM semesters WHERE id = ?').run(req.params.id);
    res.json({ message: 'Semester removed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
