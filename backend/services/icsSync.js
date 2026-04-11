const ical = require('node-ical');
const db = require('../db');
const { decrypt } = require('./tokenEncryption');

// ── Data mapping helpers ────────────────────────────────────────────────────────

function inferSemesterFromDate(dateObj) {
  if (!dateObj) {
    const now = new Date();
    return inferSemesterFromDate(now);
  }
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed
  let semester;
  if (month >= 0 && month <= 4) semester = 'Spring';
  else if (month >= 5 && month <= 6) semester = 'Summer';
  else semester = 'Fall';
  return { semester, year };
}

function inferAssignmentType(summary) {
  if (!summary) return 'homework';
  const s = summary.toLowerCase();
  if (/\b(final\s*exam|midterm|exam)\b/.test(s)) return 'exam';
  if (/\bquiz\b/.test(s)) return 'quiz';
  if (/\bproject\b/.test(s)) return 'project';
  if (/\blab\b/.test(s)) return 'lab';
  if (/\breading\b/.test(s)) return 'reading';
  return 'homework';
}

/**
 * Parse the Canvas bracket token from a SUMMARY field.
 * Canvas format: "Assignment Title [SUBJ-NUM-SECTION-CRN-SEMESTER-Course Full Name]"
 * e.g. "HW Chapter 8 [PHYSICS-240-0001-11373-2026SP-Physics For Scientists and Eng]"
 *
 * Returns { assignmentTitle, courseCode, courseName } or null if no bracket found.
 *
 * The bracket content is: SUBJECT-NUMBER-SECTION-CRN-SEMESTER-Full Name
 *   SUBJECT  = letters only, e.g. PHYSICS, STAT, CS
 *   NUMBER   = 3-4 digits + optional letter, e.g. 240, 210L
 *   SECTION  = 4 digits
 *   CRN      = 5 digits
 *   SEMESTER = e.g. 2026SP, 2025FA
 *   Full Name = remainder
 */
function parseCanvasSummary(summary) {
  if (!summary) return null;

  // Match trailing [...] bracket
  const bracketMatch = summary.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (!bracketMatch) return null;

  const assignmentTitle = bracketMatch[1].trim();
  const bracketContent  = bracketMatch[2].trim();

  // Canvas bracket format:
  //   SUBJECT-NUMBER-SECTION-CRN-SEMESTER-Course Full Name
  //   e.g. "PHYSICS-240-0001-11373-2026SP-Physics For Scientists and Eng"
  //        "PHYSICS-210-007L-14735-2026SP-General Physics I"
  //        "STAT-235-0022-14910-2026SP-Elementary Statistics"
  //        "COMP_SCI-404-0001-14821-2026SP-Intro to Algorithms & Complex"
  //
  // Strategy:
  //   parts[0] = SUBJECT  (letters + underscores, e.g. PHYSICS, COMP_SCI, STAT)
  //   parts[1] = NUMBER   (digits + optional trailing letter, e.g. 240, 210, 235)
  //   parts[2] = SECTION  (skip — e.g. 0001, 007L, 0022)
  //   parts[3] = CRN      (skip — 5-digit number, e.g. 11373, 14910)
  //   parts[4] = SEMESTER (skip — e.g. 2026SP, 2025FA)
  //   parts[5+] = Course full name (may contain dashes itself, e.g. "Intro to Algorithms & Complex")

  const parts = bracketContent.split('-');

  if (parts.length < 2) {
    // Malformed — use the whole bracket as both code and name
    return { assignmentTitle, courseCode: bracketContent, courseName: bracketContent };
  }

  const subject   = parts[0].toUpperCase();  // e.g. PHYSICS, COMP_SCI
  let   courseNum = parts[1].toUpperCase();  // e.g. 240, 210, 235

  // Detect lab sections: if section (parts[2]) ends with 'L', it's a lab section.
  // Append 'L' to the course number → PHYSICS-210 section 007L becomes PHYSICS-210L
  if (parts.length > 2) {
    const section = parts[2].toUpperCase();
    if (section.endsWith('L') && !courseNum.endsWith('L')) {
      courseNum = courseNum + 'L';
    }
  }

  // The course code is always just SUBJECT-NUMBER (with L suffix if lab section)
  const courseCode = `${subject}-${courseNum}`;

  // Skip exactly the next 3 fields (section, CRN, semester) then take the rest as the name.
  // parts[2] = section, parts[3] = CRN, parts[4] = semester, parts[5+] = name
  const nameStartIdx = Math.min(5, parts.length);
  const courseName = parts.slice(nameStartIdx).join('-').trim() || `${subject}-${courseNum}`;

  return { assignmentTitle, courseCode, courseName };
}

/**
 * Extract course info and assignment title from a Canvas ICS VEVENT.
 * Returns { name, code, assignmentTitle }.
 */
function extractCourseFromEvent(event) {
  const summary = (event.summary || '').trim();

  // Primary: parse the Canvas bracket format from SUMMARY
  const parsed = parseCanvasSummary(summary);
  if (parsed) {
    return {
      name:           parsed.courseName,
      code:           parsed.courseCode,
      assignmentTitle: parsed.assignmentTitle,
    };
  }

  // Fallback: use the whole summary as both the course key and assignment title
  return {
    name:           summary || 'Unknown Course',
    code:           summary || 'UNKNOWN',
    assignmentTitle: summary,
  };
}

function formatDate(dateObj) {
  if (!dateObj) return null;
  if (dateObj instanceof Date) {
    return dateObj.toISOString().split('T')[0];
  }
  return String(dateObj).split('T')[0];
}

const COURSE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6',
];

// ── ICS fetch & parse ───────────────────────────────────────────────────────────

async function fetchAndParseICS(icsUrl) {
  const res = await fetch(icsUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch ICS feed: HTTP ${res.status}`);
  }
  const text = await res.text();
  if (!text.startsWith('BEGIN:VCALENDAR')) {
    throw new Error('Invalid ICS feed: response is not a valid iCalendar file');
  }
  const parsed = ical.parseICS(text);
  // Filter to only VEVENT entries
  return Object.values(parsed).filter(e => e.type === 'VEVENT');
}

// ── Sync logic ──────────────────────────────────────────────────────────────────

async function syncUserICS(userId) {
  const connection = db.prepare(
    'SELECT * FROM ics_connections WHERE user_id = ? AND sync_enabled = 1'
  ).get(userId);

  if (!connection) {
    return { skipped: true, reason: 'No active ICS connection' };
  }

  let icsUrl;
  try {
    icsUrl = decrypt(connection.ics_url_encrypted);
  } catch (err) {
    db.prepare(
      'UPDATE ics_connections SET last_sync_error = ? WHERE user_id = ?'
    ).run(`Decryption error: ${err.message}`, userId);
    return { error: true, reason: `Decryption error: ${err.message}` };
  }

  const results = { coursesCreated: 0, coursesUpdated: 0, assignmentsCreated: 0, assignmentsUpdated: 0, errors: [] };

  try {
    const events = await fetchAndParseICS(icsUrl);

    // Group events by course name
    const courseGroups = {};
    const courseInfoMap = {}; // courseName -> { name, code }
    for (const event of events) {
      const courseInfo = extractCourseFromEvent(event);
      const courseName = courseInfo.name;
      if (!courseGroups[courseName]) courseGroups[courseName] = [];
      courseGroups[courseName].push(event);
      courseInfoMap[courseName] = courseInfo;
    }

    let colorIndex = db.prepare('SELECT COUNT(*) as count FROM ics_course_map WHERE user_id = ?').get(userId).count;

    for (const [courseName, courseEvents] of Object.entries(courseGroups)) {
      try {
        // Upsert ics_course_map
        let courseMap = db.prepare(
          'SELECT * FROM ics_course_map WHERE user_id = ? AND course_name = ?'
        ).get(userId, courseName);

        if (!courseMap) {
          db.prepare(
            'INSERT INTO ics_course_map (user_id, course_name) VALUES (?, ?)'
          ).run(userId, courseName);
          courseMap = db.prepare(
            'SELECT * FROM ics_course_map WHERE user_id = ? AND course_name = ?'
          ).get(userId, courseName);
        }

        // Skip excluded courses
        if (courseMap.excluded) continue;

        // Infer semester from the first event's date
        const firstEventDate = courseEvents[0]?.start;
        const { semester, year } = inferSemesterFromDate(firstEventDate);

        // Ensure semester exists
        const existingSemester = db.prepare(
          'SELECT id FROM semesters WHERE user_id = ? AND semester = ? AND year = ?'
        ).get(userId, semester, year);
        if (!existingSemester) {
          db.prepare('INSERT INTO semesters (user_id, semester, year) VALUES (?, ?, ?)').run(userId, semester, year);
        }

        // Create or update CourseTrack course
        const courseInfo = courseInfoMap[courseName];
        const courseCode = courseInfo ? courseInfo.code : courseName;
        if (!courseMap.course_id) {
          const color = COURSE_COLORS[colorIndex % COURSE_COLORS.length];
          const result = db.prepare(`
            INSERT INTO courses (user_id, name, code, semester, year, color)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(userId, courseName, courseCode, semester, year, color);

          db.prepare('UPDATE ics_course_map SET course_id = ? WHERE id = ?').run(result.lastInsertRowid, courseMap.id);
          courseMap.course_id = result.lastInsertRowid;
          results.coursesCreated++;
          colorIndex++;
        } else {
          // Update the course code if it hasn't been set properly
          db.prepare(
            'UPDATE courses SET code = ? WHERE id = ? AND (code = name OR code = ? OR code = \'Imported\' OR code = \'UNKNOWN\')'
          ).run(courseCode, courseMap.course_id, courseName);
          results.coursesUpdated++;
        }

        // Sync assignments for this course
        for (const event of courseEvents) {
          try {
            // Retrieve the clean title for this specific event
            const evInfo = extractCourseFromEvent(event);
            syncAssignment(courseMap, event, results, evInfo.assignmentTitle);
          } catch (err) {
            results.errors.push(`Assignment "${event.summary}": ${err.message}`);
          }
        }
      } catch (err) {
        results.errors.push(`Course "${courseName}": ${err.message}`);
      }
    }

    // Update last sync timestamp, clear errors
    db.prepare(
      'UPDATE ics_connections SET last_sync_at = ?, last_sync_error = NULL WHERE user_id = ?'
    ).run(new Date().toISOString(), userId);

  } catch (err) {
    db.prepare(
      'UPDATE ics_connections SET last_sync_error = ? WHERE user_id = ?'
    ).run(err.message, userId);
    results.errors.push(`Sync failed: ${err.message}`);
  }

  return results;
}

function syncAssignment(courseMap, event, results, assignmentTitle) {
  const uid = event.uid;
  if (!uid) return;

  let assignmentMap = db.prepare(
    'SELECT * FROM ics_assignment_map WHERE ics_course_map_id = ? AND ics_uid = ?'
  ).get(courseMap.id, uid);

  const dueDate = formatDate(event.start);
  // Use the clean assignment title (without the Canvas bracket)
  const title = assignmentTitle || (event.summary || 'Untitled').replace(/\s*\[[^\]]*\]\s*$/, '').trim() || 'Untitled';
  const type = inferAssignmentType(title);

  const assignmentData = {
    title,
    description: event.description || null,
    type,
    due_date: dueDate,
    status: 'pending',
  };

  if (!assignmentMap) {
    const result = db.prepare(`
      INSERT INTO assignments (course_id, title, description, type, due_date, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      courseMap.course_id,
      assignmentData.title, assignmentData.description, assignmentData.type,
      assignmentData.due_date, assignmentData.status
    );

    db.prepare(
      'INSERT INTO ics_assignment_map (ics_course_map_id, ics_uid, assignment_id) VALUES (?, ?, ?)'
    ).run(courseMap.id, uid, result.lastInsertRowid);

    results.assignmentsCreated++;
  } else if (assignmentMap.assignment_id) {
    db.prepare(`
      UPDATE assignments
      SET title = ?, description = ?, type = ?, due_date = ?
      WHERE id = ?
    `).run(
      assignmentData.title, assignmentData.description, assignmentData.type,
      assignmentData.due_date,
      assignmentMap.assignment_id
    );

    results.assignmentsUpdated++;
  }
}

// ── Sync all users (for periodic sync) ──────────────────────────────────────────

async function syncAllUsers() {
  const connections = db.prepare(
    'SELECT user_id FROM ics_connections WHERE sync_enabled = 1'
  ).all();

  console.log(`[ics-sync] Starting periodic sync for ${connections.length} user(s)`);

  for (const { user_id } of connections) {
    try {
      const result = await syncUserICS(user_id);
      if (result.error) {
        console.error(`[ics-sync] User ${user_id}: ${result.reason}`);
      } else if (!result.skipped) {
        console.log(`[ics-sync] User ${user_id}: ${result.coursesCreated + result.coursesUpdated} courses, ${result.assignmentsCreated + result.assignmentsUpdated} assignments`);
      }
    } catch (err) {
      console.error(`[ics-sync] User ${user_id} error:`, err.message);
    }

    await new Promise(r => setTimeout(r, 500));
  }
}

module.exports = { syncUserICS, syncAllUsers, fetchAndParseICS };
