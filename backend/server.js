require('dotenv').config();
const express = require('express');
const cors = require('cors');
const requireAuth = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

// Public routes (no auth required)
app.use('/api/auth', require('./routes/auth'));

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Protected routes (auth required)
app.use('/api/courses',     requireAuth, require('./routes/courses'));
app.use('/api/assignments', requireAuth, require('./routes/assignments'));
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
});
