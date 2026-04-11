const express = require('express');
const db = require('../db');
const { syncUserCanvas } = require('../services/canvasSync');

const router = express.Router();

// ── POST /api/canvas/sync ── Manual sync trigger ────────────────────────────────
router.post('/sync', async (req, res) => {
  try {
    const results = await syncUserCanvas(req.user.id);
    res.json(results);
  } catch (err) {
    console.error('[canvas-sync] manual sync error:', err);
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

// ── GET /api/canvas/status ── Connection & sync status ──────────────────────────
router.get('/status', (req, res) => {
  try {
    const connection = db.prepare(`
      SELECT canvas_instance_url, last_sync_at, sync_enabled, token_error, created_at
      FROM canvas_connections WHERE user_id = ?
    `).get(req.user.id);

    if (!connection) {
      return res.json({ connected: false });
    }

    const courses = db.prepare(`
      SELECT canvas_course_id, canvas_course_name, canvas_enrollment_term, excluded, course_id
      FROM canvas_course_map WHERE user_id = ?
    `).all(req.user.id);

    res.json({
      connected: true,
      canvas_instance_url: connection.canvas_instance_url,
      last_sync_at: connection.last_sync_at,
      sync_enabled: !!connection.sync_enabled,
      token_error: connection.token_error,
      connected_at: connection.created_at,
      courses,
    });
  } catch (err) {
    console.error('[canvas-sync] status error:', err);
    res.status(500).json({ error: 'Failed to get Canvas status' });
  }
});

// ── PUT /api/canvas/courses/:canvasCourseId/exclude ─────────────────────────────
router.put('/courses/:canvasCourseId/exclude', (req, res) => {
  try {
    const result = db.prepare(
      'UPDATE canvas_course_map SET excluded = 1 WHERE user_id = ? AND canvas_course_id = ?'
    ).run(req.user.id, req.params.canvasCourseId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Canvas course mapping not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[canvas-sync] exclude error:', err);
    res.status(500).json({ error: 'Failed to exclude course' });
  }
});

// ── PUT /api/canvas/courses/:canvasCourseId/include ─────────────────────────────
router.put('/courses/:canvasCourseId/include', (req, res) => {
  try {
    const result = db.prepare(
      'UPDATE canvas_course_map SET excluded = 0 WHERE user_id = ? AND canvas_course_id = ?'
    ).run(req.user.id, req.params.canvasCourseId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Canvas course mapping not found' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[canvas-sync] include error:', err);
    res.status(500).json({ error: 'Failed to include course' });
  }
});

// ── PUT /api/canvas/settings ── Toggle sync on/off ──────────────────────────────
router.put('/settings', (req, res) => {
  try {
    const { sync_enabled } = req.body;
    if (typeof sync_enabled !== 'boolean') {
      return res.status(400).json({ error: 'sync_enabled must be a boolean' });
    }

    const result = db.prepare(
      'UPDATE canvas_connections SET sync_enabled = ? WHERE user_id = ?'
    ).run(sync_enabled ? 1 : 0, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'No Canvas connection found' });
    }

    res.json({ success: true, sync_enabled });
  } catch (err) {
    console.error('[canvas-sync] settings error:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;
