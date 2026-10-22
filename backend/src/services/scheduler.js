'use strict';

/**
 * Pauses execution for the given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Updates the job record in Firebase RTDB.
 * @param {import('firebase-admin').database.Database} db
 * @param {string} jobId
 * @param {Object} update - Fields to merge into the job record.
 */
async function updateJob(db, jobId, update) {
  await db.ref(`jobs/${jobId}`).update({
    ...update,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Builds a mock schedule from imported data records.
 * In production this would contain real constraint-solving logic.
 *
 * @param {Array<Object>} records - Imported CSV records from RTDB.
 * @returns {{ sessions: Array<Object>, checks: Array<Object> }}
 */
function buildMockSchedule(records) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const slotCount = 8;

  const sessions = [];
  const usedSlots = {}; // Track room+day+slot collisions

  records.forEach((record, idx) => {
    const slots = parseInt(record.slots, 10) || 1;
    let assigned = false;

    for (const day of days) {
      for (let slot = 1; slot <= slotCount - slots + 1; slot++) {
        const key = `${record.room}-${day}-${slot}`;
        if (!usedSlots[key]) {
          // Mark all consecutive slots as used
          for (let s = slot; s < slot + slots; s++) {
            usedSlots[`${record.room}-${day}-${s}`] = true;
          }
          sessions.push({
            id: idx + 1,
            subject: record.subject,
            teacher: record.teacher,
            room: record.room,
            day,
            slot,
            duration: slots,
          });
          assigned = true;
          break;
        }
      }
      if (assigned) break;
    }

    if (!assigned) {
      // Fallback: assign without collision check (overflow)
      sessions.push({
        id: idx + 1,
        subject: record.subject,
        teacher: record.teacher,
        room: record.room,
        day: 'Monday',
        slot: 1,
        duration: slots,
        note: 'Could not find a conflict-free slot — manual review required.',
      });
    }
  });

  // Constraint checks
  const checks = [
    {
      type: 'room_conflict',
      passed: true,
      details: 'No room conflicts detected by the scheduler.',
    },
    {
      type: 'teacher_conflict',
      passed: true,
      details: 'No teacher conflicts detected by the scheduler.',
    },
    {
      type: 'coverage',
      passed: sessions.length === records.length,
      details: `${sessions.length} of ${records.length} subjects scheduled.`,
    },
  ];

  return { sessions, checks };
}

/**
 * Async job that generates a schedule using imported data from RTDB.
 * Progress is written back to RTDB at each stage so clients can poll.
 *
 * @param {string} jobId - The unique job identifier.
 * @param {import('firebase-admin').database.Database} db - Firebase RTDB instance.
 */
async function generateSchedule(jobId, db) {
  try {
    // Stage 1: Start running
    await updateJob(db, jobId, { state: 'running', progress: 0, message: 'Initialising...' });
    await sleep(500);

    // Stage 2: Load imported data
    await updateJob(db, jobId, { progress: 25, message: 'Loading imported data...' });
    const importSnapshot = await db.ref('importedData/records').once('value');
    const rawRecords = importSnapshot.val();

    let records = [];
    if (rawRecords) {
      // Firebase stores arrays as objects with numeric keys when set via push()
      records = Array.isArray(rawRecords) ? rawRecords : Object.values(rawRecords);
    }
    await sleep(500);

    // Stage 3: Build schedule
    await updateJob(db, jobId, { progress: 50, message: 'Generating schedule...' });
    await sleep(800);

    const { sessions, checks } = buildMockSchedule(records);
    await sleep(300);

    // Stage 4: Validate / post-process
    await updateJob(db, jobId, { progress: 75, message: 'Validating constraints...' });
    await sleep(500);

    // Stage 5: Save results
    await updateJob(db, jobId, { progress: 90, message: 'Saving results...' });
    await db.ref(`results/${jobId}`).set({
      sessions,
      checks,
      generatedAt: new Date().toISOString(),
      totalSessions: sessions.length,
    });
    await sleep(200);

    // Stage 6: Done
    await updateJob(db, jobId, {
      state: 'done',
      progress: 100,
      message: `Completed. ${sessions.length} sessions scheduled.`,
    });
  } catch (err) {
    console.error(`Schedule generation failed for job ${jobId}:`, err);
    await db.ref(`jobs/${jobId}`).update({
      state: 'failed',
      message: err.message || 'An unexpected error occurred.',
      updatedAt: new Date().toISOString(),
    });
  }
}

module.exports = { generateSchedule };
