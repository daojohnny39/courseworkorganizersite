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

    if (url.protocol !== 'https:') {
      return res.status(400).json({ error: 'Calendar feed URL must use HTTPS' });
    }

    const hostname = url.hostname.toLowerCase();
    if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|0\.0\.0\.0|::1|fd[0-9a-f]{2}:)/.test(hostname)) {
      return res.status(400).json({ error: 'Private network addresses are not allowed' });
    }

    if (!url.pathname.endsWith('.ics')) {
      return res.status(400).json({ error: 'URL must be an .ics calendar feed link' });
    }

    // Validate that the feed is reachable and valid
    let events;
    try {
      events = await fetchAndParseICS(ics_url);
    } catch (err) {
      console.error(err);
      return res.status(400).json({
        error: 'Could not fetch or parse the calendar feed. Make sure the URL is correct.',
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
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
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
