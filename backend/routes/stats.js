const express = require('express');
const router = express.Router();
const db = require('../db');

// GET dashboard stats
router.get('/stats', (req, res) => {
  try {
    const { semester, year } = req.query;
    let courseFilter = '1=1';
    const params = [];

    if (semester && year) {
      courseFilter = 'c.semester = ? AND c.year = ?';
      params.push(semester, year);
    }

    const totalCourses = db.prepare(`SELECT COUNT(*) as count FROM courses c WHERE ${courseFilter}`).get(...params);
    const totalAssignments = db.prepare(`
      SELECT COUNT(*) as count FROM assignments a
      JOIN courses c ON a.course_id = c.id WHERE ${courseFilter}
    `).get(...params);
    const completedAssignments = db.prepare(`
      SELECT COUNT(*) as count FROM assignments a
      JOIN courses c ON a.course_id = c.id WHERE ${courseFilter} AND a.status = 'completed'
    `).get(...params);
    const upcomingAssignments = db.prepare(`
      SELECT a.*, c.name as course_name, c.code as course_code, c.color as course_color
      FROM assignments a JOIN courses c ON a.course_id = c.id
      WHERE ${courseFilter} AND a.due_date >= date('now') AND a.status != 'completed'
      ORDER BY a.due_date ASC LIMIT 5
    `).all(...params);

    res.json({
      totalCourses: totalCourses.count,
      totalAssignments: totalAssignments.count,
      completedAssignments: completedAssignments.count,
      upcomingAssignments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
