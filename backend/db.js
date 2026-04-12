const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'coursework.db'));

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints (off by default in SQLite)
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    instructor TEXT,
    credits INTEGER DEFAULT 3,
    color TEXT DEFAULT '#6366f1',
    semester TEXT NOT NULL,
    year INTEGER NOT NULL,
    grade TEXT,
    target_grade TEXT DEFAULT 'A',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'homework',
    start_date TEXT,
    end_date TEXT,
    due_date TEXT,
    grade REAL,
    max_grade REAL DEFAULT 100,
    weight REAL DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL,
    assignment_id INTEGER,
    title TEXT NOT NULL,
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS semesters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    semester TEXT NOT NULL,
    year INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, semester, year),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ics_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    ics_url_encrypted TEXT NOT NULL,
    last_sync_at TEXT,
    last_sync_error TEXT,
    sync_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ics_course_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    course_name TEXT NOT NULL,
    course_id INTEGER,
    excluded INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, course_name),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS ics_assignment_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ics_course_map_id INTEGER NOT NULL,
    ics_uid TEXT NOT NULL,
    assignment_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(ics_course_map_id, ics_uid),
    FOREIGN KEY (ics_course_map_id) REFERENCES ics_course_map(id) ON DELETE CASCADE,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE SET NULL
  );
`);

// ── Migrations: add columns that didn't exist in earlier schema versions ──
const assignmentCols = db.prepare('PRAGMA table_info(assignments)').all().map(c => c.name);
if (!assignmentCols.includes('start_date')) {
  db.exec('ALTER TABLE assignments ADD COLUMN start_date TEXT');
  console.log('[db] Migration: added start_date column to assignments');
}
if (!assignmentCols.includes('end_date')) {
  db.exec('ALTER TABLE assignments ADD COLUMN end_date TEXT');
  console.log('[db] Migration: added end_date column to assignments');
}

const courseCols = db.prepare('PRAGMA table_info(courses)').all().map(c => c.name);
if (!courseCols.includes('user_id')) {
  db.exec('ALTER TABLE courses ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  console.log('[db] Migration: added user_id column to courses');
}

// ── Migration: drop old Canvas tables if they still exist ──
db.exec(`
  DROP TABLE IF EXISTS canvas_assignment_map;
  DROP TABLE IF EXISTS canvas_course_map;
  DROP TABLE IF EXISTS canvas_connections;
`);

/**
 * Fix stale ICS-imported course codes where code was set equal to the course name.
 * Extracts a proper code (e.g. "PHYSICS-240") using a regex pattern if possible.
 * This runs once at startup as a lightweight migration.
 */
function fixStaleIcsCodes() {
  try {
    // Find ICS-linked courses where code is the same as the name (old sync behavior)
    // or known bad sentinel values
    const staleCourses = db.prepare(`
      SELECT c.id, c.name, c.code
      FROM courses c
      INNER JOIN ics_course_map m ON m.course_id = c.id
      WHERE c.code = c.name OR c.code = 'Imported' OR c.code = 'UNKNOWN'
    `).all();

    for (const course of staleCourses) {
      const name = course.name || '';

      // Pattern 1: already a short code like "PHYS 240" or "PHYSICS-210L"
      let match = name.match(/^([A-Za-z]{2,10})[-\s]?(\d{3,4}[A-Za-z]*)$/);
      if (match) {
        const newCode = `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
        db.prepare('UPDATE courses SET code = ? WHERE id = ?').run(newCode, course.id);
        console.log(`[db] Fixed course code: "${course.name}" → "${newCode}"`);
        continue;
      }

      // Pattern 2: number embedded anywhere in the name e.g. "Physics 240" or "Intro to Physics 240L"
      match = name.match(/\b([A-Za-z]{3,10})\s*[-]?\s*(\d{3,4}[A-Za-z]?)\b/);
      if (match) {
        const newCode = `${match[1].toUpperCase()}-${match[2].toUpperCase()}`;
        db.prepare('UPDATE courses SET code = ? WHERE id = ?').run(newCode, course.id);
        console.log(`[db] Fixed course code: "${course.name}" → "${newCode}"`);
      }
    }

    if (staleCourses.length > 0) {
      console.log(`[db] fixStaleIcsCodes: checked ${staleCourses.length} ICS course(s)`);
    }
  } catch (err) {
    console.error('[db] fixStaleIcsCodes error:', err.message);
  }
}

module.exports = db;
module.exports.fixStaleIcsCodes = fixStaleIcsCodes;
