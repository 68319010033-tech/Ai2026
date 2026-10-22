'use strict';

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { db } = require('../config/firebase');

const router = express.Router();

/**
 * Converts an array of session objects to a CSV string.
 * @param {Array<Object>} sessions
 * @returns {string} CSV content
 */
function sessionsToCSV(sessions) {
  if (!sessions || sessions.length === 0) {
    return 'subject,teacher,room,day,slot\n';
  }

  const headers = Object.keys(sessions[0]);
  const rows = sessions.map((session) =>
    headers
      .map((h) => {
        const val = session[h] !== undefined ? String(session[h]) : '';
        // Escape values that contain commas, quotes, or newlines
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      })
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * GET /api/schedule/:jobId
 * Requires: Bearer token
 * Returns the generated schedule result from Firebase RTDB.
 * Response: { sessions, checks } or 404
 */
router.get('/schedule/:jobId', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;

    // First check job state
    const jobSnapshot = await db.ref(`jobs/${jobId}`).once('value');
    if (!jobSnapshot.exists()) {
      return res.status(404).json({ message: `Job "${jobId}" not found.` });
    }

    const job = jobSnapshot.val();
    if (job.state !== 'done') {
      return res.status(409).json({
        message: `Job is not finished yet. Current state: ${job.state}`,
        state: job.state,
        progress: job.progress,
      });
    }

    const resultSnapshot = await db.ref(`results/${jobId}`).once('value');
    if (!resultSnapshot.exists()) {
      return res.status(404).json({ message: `No results found for job "${jobId}".` });
    }

    const result = resultSnapshot.val();
    return res.status(200).json({
      sessions: result.sessions || [],
      checks: result.checks || [],
    });
  } catch (err) {
    console.error('Schedule fetch error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * GET /api/export/solution.csv
 * Requires: Bearer token
 * Query param: ?jobId=<jobId>
 * Downloads the schedule as a CSV file.
 */
router.get('/export/solution.csv', authenticate, async (req, res) => {
  try {
    const { jobId } = req.query;
    if (!jobId) {
      return res.status(400).json({ message: 'Query parameter "jobId" is required.' });
    }

    // Check job completion
    const jobSnapshot = await db.ref(`jobs/${jobId}`).once('value');
    if (!jobSnapshot.exists()) {
      return res.status(404).json({ message: `Job "${jobId}" not found.` });
    }

    const job = jobSnapshot.val();
    if (job.state !== 'done') {
      return res.status(409).json({
        message: `Job is not finished yet. Current state: ${job.state}`,
        state: job.state,
        progress: job.progress,
      });
    }

    const resultSnapshot = await db.ref(`results/${jobId}`).once('value');
    if (!resultSnapshot.exists()) {
      return res.status(404).json({ message: `No results found for job "${jobId}".` });
    }

    const result = resultSnapshot.val();
    const csvContent = sessionsToCSV(result.sessions || []);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="solution.csv"');
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Export error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
