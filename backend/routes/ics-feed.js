const express = require('express');
const db = require('../db');
const { encrypt } = require('../services/tokenEncryption');
const { fetchAndParseICS, syncUserICS } = require('../services/icsSync');

const router = express.Router();

// ── POST /api/ics-feed/connect ────────────────────────────────────────────────
// Saves an ICS calendar feed URL and triggers initial sync.
router.post('/connect', async (req, res) => {
  try {
    const { ics_url } = req.body;

    if (!ics_url) {
      return res.status(400).json({ error: 'Calendar feed URL is required' });
    }

    // Basic URL validation
    let url;
    try {
      url = new URL(ics_url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    if (!url.pathname.endsWith('.ics')) {
      return res.status(400).json({ error: 'URL must be an .ics calendar feed link' });
    }

    // Validate that the feed is reachable and valid
    let events;
    try {
      events = await fetchAndParseICS(ics_url);
    } catch (err) {
      return res.status(400).json({
        error: 'Could not fetch or parse the calendar feed. Make sure the URL is correct.',
        details: err.message,
      });
    }

    // Encrypt and store
    const encrypted = encrypt(ics_url);
    const userId = req.user.id;

    const existing = db.prepare('SELECT id FROM ics_connections WHERE user_id = ?').get(userId);

    if (existing) {
      db.prepare(`
        UPDATE ics_connections
        SET ics_url_encrypted = ?, last_sync_error = NULL, sync_enabled = 1
        WHERE user_id = ?
      `).run(encrypted, userId);
    } else {
      db.prepare(
        'INSERT INTO ics_connections (user_id, ics_url_encrypted) VALUES (?, ?)'
      ).run(userId, encrypted);
    }

    // Trigger initial sync
    const syncResult = await syncUserICS(userId);

    res.json({
      success: true,
      event_count: events.length,
      sync: syncResult,
    });
  } catch (err) {
    console.error('[ics-feed] connect error:', err);
    res.status(500).json({ error: 'Failed to connect calendar feed' });
  }
});

// ── DELETE /api/ics-feed/disconnect ───────────────────────────────────────────
router.delete('/disconnect', (req, res) => {
  try {
    const userId = req.user.id;

    // Delete mapping data first (cascade should handle it, but be explicit)
    const courseMaps = db.prepare('SELECT id FROM ics_course_map WHERE user_id = ?').all(userId);
    for (const cm of courseMaps) {
      db.prepare('DELETE FROM ics_assignment_map WHERE ics_course_map_id = ?').run(cm.id);
    }
    db.prepare('DELETE FROM ics_course_map WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM ics_connections WHERE user_id = ?').run(userId);

    res.json({ success: true });
  } catch (err) {
    console.error('[ics-feed] disconnect error:', err);
    res.status(500).json({ error: 'Failed to disconnect calendar feed' });
  }
});

module.exports = router;
