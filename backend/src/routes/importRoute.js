'use strict';

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { parseCSV } = require('../services/csvParser');
const { db } = require('../config/firebase');

const router = express.Router();

// Use in-memory storage — we process the buffer directly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted.'));
    }
  },
});

/**
 * POST /api/import
 * Requires: Bearer token (authenticate middleware)
 * Form-data field: "file" (CSV)
 * Response: { ok: true, errors: [{ file, row, message }] }
 */
router.post('/import', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, errors: [{ file: null, row: null, message: 'No file uploaded. Use field name "file".' }] });
    }

    const { records, errors } = parseCSV(req.file.buffer, req.file.originalname);

    if (records.length > 0) {
      // Save valid records to Firebase RTDB under importedData/
      const importRef = db.ref('importedData');
      await importRef.set({
        records,
        importedAt: new Date().toISOString(),
        importedBy: req.user.userId,
        filename: req.file.originalname,
      });
    }

    return res.status(200).json({
      ok: true,
      imported: records.length,
      errors,
    });
  } catch (err) {
    console.error('Import error:', err);
    return res.status(500).json({ ok: false, errors: [{ file: null, row: null, message: err.message }] });
  }
});

module.exports = router;
