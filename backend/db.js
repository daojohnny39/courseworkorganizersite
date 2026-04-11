const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'coursework.db'));

// Enable WAL mode for performance
db.pragma('journal_mode = WAL');

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

  CREATE TABLE IF NOT EXISTS canvas_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    canvas_instance_url TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TEXT,
    token_error TEXT,
    last_sync_at TEXT,
    sync_enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS canvas_course_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    canvas_course_id INTEGER NOT NULL,
    course_id INTEGER,
    excluded INTEGER DEFAULT 0,
    canvas_course_name TEXT,
    canvas_enrollment_term TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, canvas_course_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS canvas_assignment_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    canvas_course_map_id INTEGER NOT NULL,
    canvas_assignment_id INTEGER NOT NULL,
    assignment_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(canvas_course_map_id, canvas_assignment_id),
    FOREIGN KEY (canvas_course_map_id) REFERENCES canvas_course_map(id) ON DELETE CASCADE,
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

module.exports = db;
