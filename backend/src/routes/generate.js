'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const { generateSchedule } = require('../services/scheduler');
const { db } = require('../config/firebase');

const router = express.Router();

/**
 * POST /api/generate
 * Requires: Bearer token
 * Triggers the schedule generation job and returns a jobId immediately.
 * Response: { jobId }
 */
router.post('/generate', authenticate, async (req, res) => {
  try {
    const jobId = uuidv4();
    const jobRef = db.ref(`jobs/${jobId}`);

    await jobRef.set({
      state: 'queued',
      progress: 0,
      message: 'Waiting...',
      createdAt: new Date().toISOString(),
      createdBy: req.user.userId,
    });

    // Run the generation asynchronously — do not await
    setImmediate(() => {
      generateSchedule(jobId, db).catch((err) => {
        console.error(`Background job ${jobId} crashed unexpectedly:`, err);
      });
    });

    return res.status(202).json({ jobId });
  } catch (err) {
    console.error('Generate error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

/**
 * GET /api/status/:jobId
 * Returns current job state from RTDB.
 * Response: { state, progress, message } or 404
 */
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    if (!jobId || !/^[0-9a-f-]{36}$/.test(jobId)) {
      return res.status(400).json({ message: 'Invalid jobId format.' });
    }

    const snapshot = await db.ref(`jobs/${jobId}`).once('value');
    if (!snapshot.exists()) {
      return res.status(404).json({ message: `Job "${jobId}" not found.` });
    }

    const job = snapshot.val();
    return res.status(200).json({
      state: job.state,
      progress: job.progress,
      message: job.message,
    });
  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
