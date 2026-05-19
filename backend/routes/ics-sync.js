const express = require('express');
const db = require('../db');
const { syncUserICS } = require('../services/icsSync');

const router = express.Router();

// ── POST /api/ics/sync ── Manual sync trigger ─────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const results = await syncUserICS(req.user.id);
    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/ics/status ── Connection & sync status ───────────────────────────
router.get('/status', (req, res) => {
  try {
    const connection = db.prepare(`
      SELECT last_sync_at, last_sync_error, sync_enabled, created_at
      FROM ics_connections WHERE user_id = ?
    `).get(req.user.id);

    if (!connection) {
      return res.json({ connected: false });
    }

    const courses = db.prepare(`
      SELECT id, course_name, excluded, course_id
      FROM ics_course_map WHERE user_id = ?
    `).all(req.user.id);

    res.json({
      connected: true,
      last_sync_at: connection.last_sync_at,
      last_sync_error: connection.last_sync_error,
      sync_enabled: !!connection.sync_enabled,
      connected_at: connection.created_at,
      courses,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/ics/courses/:id/exclude ──────────────────────────────────────────
router.put('/courses/:id/exclude', (req, res) => {
  try {
    const result = db.prepare(
      'UPDATE ics_course_map SET excluded = 1 WHERE user_id = ? AND id = ?'
    ).run(req.user.id, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Course mapping not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/ics/courses/:id/include ──────────────────────────────────────────
router.put('/courses/:id/include', (req, res) => {
  try {
    const result = db.prepare(
      'UPDATE ics_course_map SET excluded = 0 WHERE user_id = ? AND id = ?'
    ).run(req.user.id, req.params.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Course mapping not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT /api/ics/settings ── Toggle sync on/off ──────────────────────────────
router.put('/settings', (req, res) => {
  try {
    const { sync_enabled } = req.body;
    if (typeof sync_enabled !== 'boolean') {
      return res.status(400).json({ error: 'sync_enabled must be a boolean' });
    }

    const result = db.prepare(
      'UPDATE ics_connections SET sync_enabled = ? WHERE user_id = ?'
    ).run(sync_enabled ? 1 : 0, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'No calendar feed connected' });
    }

    res.json({ success: true, sync_enabled });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
