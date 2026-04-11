const db = require('../db');
const { decrypt } = require('./tokenEncryption');
const { getCanvasCourses, getCanvasAssignments } = require('./canvasApi');

// ── Data mapping helpers ────────────────────────────────────────────────────────

const SEASON_ORDER = ['Winter', 'Spring', 'Summer', 'Fall'];

function mapEnrollmentTerm(termName, courseStartAt) {
  let semester = null;
  let year = null;

  if (termName && termName !== 'Default Term') {
    const seasonMatch = termName.match(/\b(Spring|Summer|Fall|Winter)\b/i);
    if (seasonMatch) {
      semester = seasonMatch[1].charAt(0).toUpperCase() + seasonMatch[1].slice(1).toLowerCase();
    }

    const yearMatch = termName.match(/\b(20\d{2})\b/);
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10);
    }
  }

  // Fallback: infer from course start date
  if ((!semester || !year) && courseStartAt) {
    const d = new Date(courseStartAt);
    if (!year) year = d.getFullYear();
    if (!semester) {
      const month = d.getMonth(); // 0-indexed
      if (month >= 0 && month <= 4) semester = 'Spring';
      else if (month >= 5 && month <= 6) semester = 'Summer';
      else semester = 'Fall';
    }
  }

  // Final fallback: current semester
  if (!semester || !year) {
    const now = new Date();
    if (!year) year = now.getFullYear();
    if (!semester) {
      const month = now.getMonth();
      if (month >= 0 && month <= 4) semester = 'Spring';
      else if (month >= 5 && month <= 6) semester = 'Summer';
      else semester = 'Fall';
    }
  }

  return { semester, year };
}

function mapSubmissionType(submissionTypes) {
  if (!submissionTypes || submissionTypes.length === 0) return 'other';
  if (submissionTypes.includes('online_quiz')) return 'quiz';
  if (submissionTypes.includes('discussion_topic')) return 'homework';
  if (submissionTypes.includes('external_tool')) return 'other';
  return 'homework';
}

function stripHtml(html) {
  if (!html) return null;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim() || null;
}

function scoreToLetterGrade(score) {
  if (score == null) return null;
  if (score >= 93) return 'A';
  if (score >= 90) return 'A-';
  if (score >= 87) return 'B+';
  if (score >= 83) return 'B';
  if (score >= 80) return 'B-';
  if (score >= 77) return 'C+';
  if (score >= 73) return 'C';
  if (score >= 70) return 'C-';
  if (score >= 67) return 'D+';
  if (score >= 63) return 'D';
  if (score >= 60) return 'D-';
  return 'F';
}

function formatDate(isoString) {
  if (!isoString) return null;
  return isoString.split('T')[0]; // YYYY-MM-DD
}

// Color palette for auto-assigned course colors
const COURSE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

// ── Token management ────────────────────────────────────────────────────────────

function getDecryptedToken(connection) {
  return decrypt(connection.access_token);
}

// ── Sync logic ──────────────────────────────────────────────────────────────────

async function syncUserCanvas(userId) {
  const connection = db.prepare(
    'SELECT * FROM canvas_connections WHERE user_id = ? AND sync_enabled = 1'
  ).get(userId);

  if (!connection) {
    return { skipped: true, reason: 'No active Canvas connection' };
  }

  let accessToken;
  try {
    accessToken = getDecryptedToken(connection);
  } catch (err) {
    db.prepare(
      'UPDATE canvas_connections SET token_error = ?, sync_enabled = 0 WHERE user_id = ?'
    ).run(err.message, userId);
    return { error: true, reason: `Token error: ${err.message}` };
  }

  const instanceUrl = connection.canvas_instance_url;
  const results = { coursesCreated: 0, coursesUpdated: 0, assignmentsCreated: 0, assignmentsUpdated: 0, errors: [] };

  try {
    // Fetch Canvas courses
    const canvasCourses = await getCanvasCourses(instanceUrl, accessToken);

    // Count existing courses for color assignment
    let colorIndex = db.prepare('SELECT COUNT(*) as count FROM canvas_course_map WHERE user_id = ?').get(userId).count;

    for (const cc of canvasCourses) {
      try {
        await syncCourse(userId, instanceUrl, accessToken, cc, colorIndex, results);
        colorIndex++;
      } catch (err) {
        results.errors.push(`Course "${cc.name}": ${err.message}`);
      }
    }

    // Update last sync timestamp
    db.prepare(
      'UPDATE canvas_connections SET last_sync_at = ?, token_error = NULL WHERE user_id = ?'
    ).run(new Date().toISOString(), userId);

  } catch (err) {
    results.errors.push(`Sync failed: ${err.message}`);
  }

  return results;
}

async function syncCourse(userId, instanceUrl, accessToken, canvasCourse, colorIndex, results) {
  const termName = canvasCourse.term?.name || null;
  const { semester, year } = mapEnrollmentTerm(termName, canvasCourse.start_at);

  // Upsert canvas_course_map
  let courseMap = db.prepare(
    'SELECT * FROM canvas_course_map WHERE user_id = ? AND canvas_course_id = ?'
  ).get(userId, canvasCourse.id);

  if (!courseMap) {
    db.prepare(`
      INSERT INTO canvas_course_map (user_id, canvas_course_id, canvas_course_name, canvas_enrollment_term)
      VALUES (?, ?, ?, ?)
    `).run(userId, canvasCourse.id, canvasCourse.name, termName);

    courseMap = db.prepare(
      'SELECT * FROM canvas_course_map WHERE user_id = ? AND canvas_course_id = ?'
    ).get(userId, canvasCourse.id);
  } else {
    db.prepare(
      'UPDATE canvas_course_map SET canvas_course_name = ?, canvas_enrollment_term = ? WHERE id = ?'
    ).run(canvasCourse.name, termName, courseMap.id);
  }

  // Skip excluded courses
  if (courseMap.excluded) return;

  // Ensure semester exists
  const existingSemester = db.prepare(
    'SELECT id FROM semesters WHERE user_id = ? AND semester = ? AND year = ?'
  ).get(userId, semester, year);

  if (!existingSemester) {
    db.prepare('INSERT INTO semesters (user_id, semester, year) VALUES (?, ?, ?)').run(userId, semester, year);
  }

  // Compute course grade from Canvas enrollment scores
  let courseGrade = null;
  if (canvasCourse.enrollments?.length > 0) {
    const score = canvasCourse.enrollments[0].computed_current_score;
    courseGrade = scoreToLetterGrade(score);
  }

  // Create or update the CourseTrack course
  if (!courseMap.course_id) {
    const color = COURSE_COLORS[colorIndex % COURSE_COLORS.length];
    const result = db.prepare(`
      INSERT INTO courses (user_id, name, code, semester, year, color, grade)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, canvasCourse.name, canvasCourse.course_code || canvasCourse.name, semester, year, color, courseGrade);

    db.prepare('UPDATE canvas_course_map SET course_id = ? WHERE id = ?').run(result.lastInsertRowid, courseMap.id);
    courseMap.course_id = result.lastInsertRowid;
    results.coursesCreated++;
  } else {
    db.prepare(`
      UPDATE courses SET name = ?, code = ?, semester = ?, year = ?, grade = ?
      WHERE id = ? AND user_id = ?
    `).run(canvasCourse.name, canvasCourse.course_code || canvasCourse.name, semester, year, courseGrade, courseMap.course_id, userId);
    results.coursesUpdated++;
  }

  // Sync assignments for this course
  const canvasAssignments = await getCanvasAssignments(instanceUrl, accessToken, canvasCourse.id);

  for (const ca of canvasAssignments) {
    try {
      syncAssignment(courseMap, ca, results);
    } catch (err) {
      results.errors.push(`Assignment "${ca.name}": ${err.message}`);
    }
  }
}

function syncAssignment(courseMap, canvasAssignment, results) {
  let assignmentMap = db.prepare(
    'SELECT * FROM canvas_assignment_map WHERE canvas_course_map_id = ? AND canvas_assignment_id = ?'
  ).get(courseMap.id, canvasAssignment.id);

  const submission = canvasAssignment.submission;
  const grade = submission?.score ?? null;
  const status = submission?.workflow_state === 'graded' ? 'completed' : 'pending';
  const type = mapSubmissionType(canvasAssignment.submission_types);

  const assignmentData = {
    title: canvasAssignment.name,
    description: stripHtml(canvasAssignment.description),
    type,
    start_date: formatDate(canvasAssignment.unlock_at),
    end_date: formatDate(canvasAssignment.lock_at),
    due_date: formatDate(canvasAssignment.due_at),
    grade,
    max_grade: canvasAssignment.points_possible || 100,
    weight: canvasAssignment.group_weight || 0,
    status,
  };

  if (!assignmentMap) {
    // Create new assignment
    const result = db.prepare(`
      INSERT INTO assignments (course_id, title, description, type, start_date, end_date, due_date, grade, max_grade, weight, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      courseMap.course_id,
      assignmentData.title, assignmentData.description, assignmentData.type,
      assignmentData.start_date, assignmentData.end_date, assignmentData.due_date,
      assignmentData.grade, assignmentData.max_grade, assignmentData.weight, assignmentData.status
    );

    db.prepare(
      'INSERT INTO canvas_assignment_map (canvas_course_map_id, canvas_assignment_id, assignment_id) VALUES (?, ?, ?)'
    ).run(courseMap.id, canvasAssignment.id, result.lastInsertRowid);

    results.assignmentsCreated++;
  } else if (assignmentMap.assignment_id) {
    // Update existing assignment
    db.prepare(`
      UPDATE assignments
      SET title = ?, description = ?, type = ?, start_date = ?, end_date = ?, due_date = ?,
          grade = ?, max_grade = ?, weight = ?, status = ?
      WHERE id = ?
    `).run(
      assignmentData.title, assignmentData.description, assignmentData.type,
      assignmentData.start_date, assignmentData.end_date, assignmentData.due_date,
      assignmentData.grade, assignmentData.max_grade, assignmentData.weight, assignmentData.status,
      assignmentMap.assignment_id
    );

    results.assignmentsUpdated++;
  }
}

// ── Sync all users (for periodic sync) ──────────────────────────────────────────

async function syncAllUsers() {
  const connections = db.prepare(
    'SELECT user_id FROM canvas_connections WHERE sync_enabled = 1'
  ).all();

  console.log(`[canvas-sync] Starting periodic sync for ${connections.length} user(s)`);

  for (const { user_id } of connections) {
    try {
      const result = await syncUserCanvas(user_id);
      if (result.error) {
        console.error(`[canvas-sync] User ${user_id}: ${result.reason}`);
      } else if (!result.skipped) {
        console.log(`[canvas-sync] User ${user_id}: ${result.coursesCreated + result.coursesUpdated} courses, ${result.assignmentsCreated + result.assignmentsUpdated} assignments`);
      }
    } catch (err) {
      console.error(`[canvas-sync] User ${user_id} error:`, err.message);
    }

    // Small delay between users to avoid hammering Canvas
    await new Promise(r => setTimeout(r, 500));
  }
}

module.exports = { syncUserCanvas, syncAllUsers };
