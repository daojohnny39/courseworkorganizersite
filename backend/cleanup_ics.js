/**
 * cleanup_ics.js — One-time script to purge all ICS-imported data,
 * then re-sync with the corrected extraction logic.
 *
 * Run: node cleanup_ics.js
 */
require('dotenv').config();
const db = require('./db');
const { syncUserICS } = require('./services/icsSync');

async function main() {
  console.log('=== ICS Cleanup & Re-sync ===\n');

  // Find all users with ICS connections
  const users = db.prepare('SELECT user_id FROM ics_connections WHERE sync_enabled = 1').all();
  if (!users.length) {
    console.log('No active ICS connections found.');
    return;
  }

  for (const { user_id } of users) {
    console.log(`Processing user ${user_id}...`);

    // Get all ICS course maps for this user
    const courseMaps = db.prepare('SELECT * FROM ics_course_map WHERE user_id = ?').all(user_id);
    console.log(`  Found ${courseMaps.length} course map entries`);

    for (const cm of courseMaps) {
      // Delete all assignments linked to this ics_course_map
      const assignmentMaps = db.prepare('SELECT * FROM ics_assignment_map WHERE ics_course_map_id = ?').all(cm.id);
      for (const am of assignmentMaps) {
        if (am.assignment_id) {
          db.prepare('DELETE FROM assignments WHERE id = ?').run(am.assignment_id);
        }
      }
      db.prepare('DELETE FROM ics_assignment_map WHERE ics_course_map_id = ?').run(cm.id);

      // Delete the linked course if it exists
      if (cm.course_id) {
        db.prepare('DELETE FROM courses WHERE id = ?').run(cm.course_id);
      }
    }

    // Clear all course maps
    db.prepare('DELETE FROM ics_course_map WHERE user_id = ?').run(user_id);
    console.log('  Cleared all ICS-imported courses and assignments.');

    // Re-sync
    console.log('  Re-syncing from Canvas...');
    try {
      const result = await syncUserICS(user_id);
      console.log(`  ✓ Sync complete:`);
      console.log(`    Courses created: ${result.coursesCreated}`);
      console.log(`    Courses updated: ${result.coursesUpdated}`);
      console.log(`    Assignments created: ${result.assignmentsCreated}`);
      console.log(`    Assignments updated: ${result.assignmentsUpdated}`);
      if (result.errors?.length) {
        console.log(`    Errors: ${result.errors.length}`);
        result.errors.forEach(e => console.log(`      - ${e}`));
      }
    } catch (err) {
      console.error(`  ✗ Sync failed: ${err.message}`);
    }
  }

  // Show resulting courses
  console.log('\n=== Resulting courses (ICS-linked) ===');
  const courses = db.prepare(`
    SELECT c.id, c.name, c.code, c.semester, c.year
    FROM courses c
    INNER JOIN ics_course_map m ON m.course_id = c.id
    ORDER BY c.code
  `).all();
  courses.forEach(c => console.log(`  [${c.code}] ${c.name} (${c.semester} ${c.year})`));

  console.log('\nDone!');
}

main().catch(console.error);
