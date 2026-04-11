const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getCanvasUser } = require('../services/canvasApi');
const { encrypt } = require('../services/tokenEncryption');

const router = express.Router();

// ── POST /api/canvas-auth/connect ──────────────────────────────────────────────
// Connects a Canvas account using a personal access token.
// Creates a new CourseTrack account if one doesn't exist for the Canvas email.
router.post('/connect', async (req, res) => {
  try {
    let { canvas_url, access_token } = req.body;

    if (!canvas_url || !access_token) {
      return res.status(400).json({ error: 'Canvas URL and access token are required' });
    }

    // Normalize: ensure https and strip trailing slash
    if (!canvas_url.startsWith('http://') && !canvas_url.startsWith('https://')) {
      canvas_url = `https://${canvas_url}`;
    }
    canvas_url = canvas_url.replace(/\/+$/, '');

    // Validate the token by fetching the Canvas user profile
    let canvasUser;
    try {
      canvasUser = await getCanvasUser(canvas_url, access_token);
    } catch (err) {
      return res.status(401).json({
        error: 'Could not connect to Canvas. Check your URL and access token.',
        details: err.message,
      });
    }

    const email = canvasUser.primary_email || canvasUser.login_id || canvasUser.email;
    if (!email) {
      return res.status(400).json({ error: 'Could not retrieve email from your Canvas account' });
    }

    // Find or create user
    let user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(email.toLowerCase());

    if (!user) {
      const result = db.prepare(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)'
      ).run(email.toLowerCase(), '');
      user = { id: result.lastInsertRowid, email: email.toLowerCase() };
    }

    // Store or update the canvas connection (personal tokens don't expire)
    const existingConnection = db.prepare(
      'SELECT id FROM canvas_connections WHERE user_id = ?'
    ).get(user.id);

    if (existingConnection) {
      db.prepare(`
        UPDATE canvas_connections
        SET canvas_instance_url = ?, access_token = ?, refresh_token = NULL,
            token_expires_at = NULL, token_error = NULL, sync_enabled = 1
        WHERE user_id = ?
      `).run(canvas_url, encrypt(access_token), user.id);
    } else {
      db.prepare(`
        INSERT INTO canvas_connections (user_id, canvas_instance_url, access_token)
        VALUES (?, ?, ?)
      `).run(user.id, canvas_url, encrypt(access_token));
    }

    // Sign a CourseTrack JWT
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({ token, user: { id: user.id, email: user.email, has_canvas: true } });
  } catch (err) {
    console.error('[canvas-auth] connect error:', err);
    res.status(500).json({ error: 'Failed to connect Canvas account' });
  }
});

module.exports = router;
