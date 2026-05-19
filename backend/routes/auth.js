require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts, please try again later' },
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// POST /api/auth/register
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (email, password_hash) VALUES (?, ?)'
    ).run(email.toLowerCase().trim(), password_hash);

    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    // If this is the first user, claim any existing unclaimed courses
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount === 1) {
      const claimed = db.prepare('UPDATE courses SET user_id = ? WHERE user_id IS NULL').run(user.id);
      if (claimed.changes > 0) {
        console.log(`[auth] First user registered — assigned ${claimed.changes} existing course(s) to ${user.email}`);
      }
    }

    const token = signToken(user);
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const safeUser = { id: user.id, email: user.email, created_at: user.created_at };
    const token = signToken(safeUser);
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me  (requires auth header — used by frontend on load)
router.get('/me', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const icsConn = db.prepare('SELECT id FROM ics_connections WHERE user_id = ?').get(decoded.id);
    user.has_ics_feed = !!icsConn;

    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
