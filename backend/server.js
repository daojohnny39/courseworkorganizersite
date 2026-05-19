require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const requireAuth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Middleware
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Public routes (no auth required)
app.use('/api/auth', require('./routes/auth'));

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes (auth required)
app.use('/api/courses',     requireAuth, require('./routes/courses'));
app.use('/api/assignments', requireAuth, require('./routes/assignments'));
app.use('/api/semesters',   requireAuth, require('./routes/semesters'));
app.use('/api/ics-feed',    requireAuth, require('./routes/ics-feed'));
app.use('/api/ics',         requireAuth, require('./routes/ics-sync'));
app.use('/api/events',      requireAuth, require('./routes/events'));
app.use('/api',             requireAuth, require('./routes/stats'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🎓 CourseTrack API running on http://localhost:${PORT}`);

  // Fix any stale ICS course codes from older syncs
  const { fixStaleIcsCodes } = require('./db');
  fixStaleIcsCodes();

  // Periodic ICS sync every 30 minutes
  const { syncAllUsers } = require('./services/icsSync');
  setInterval(() => {
    syncAllUsers().catch(err => console.error('[ics-sync] periodic sync error:', err));
  }, 30 * 60 * 1000);
});
