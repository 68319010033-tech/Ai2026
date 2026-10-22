'use strict';

const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { parseCSV } = require('../services/csvParser');
const { db } = require('../config/firebase');

const router = express.Router();

const safeKey = (name) =>
  String(name).replace(/\.csv$/i, '').replace(/[.#$/\[\]]/g, '_') || '_';

const sanitizeFiles = (files) =>
  files && typeof files === 'object' && !Array.isArray(files)
    ? Object.fromEntries(Object.entries(files).map(([k, v]) => [safeKey(k), v]))
    : {};

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
 * Accepts either:
 *  - Form-data field: "file" (CSV)
 *  - JSON body: { records: [...], files: {...}, useSample: boolean }
 * Response: { ok: true, imported: number, errors: [{ file, row, message }] }
 */
router.post(
  '/import',
  authenticate,
  (req, res, next) => {
    if (req.is('application/json')) {
      return next();
    }
    upload.single('file')(req, res, next);
  },
  async (req, res) => {
    try {
      if (req.is('application/json')) {
        const { records = [], useSample = false, files = {} } = req.body || {};
        const safeFiles = sanitizeFiles(files);
        const importRef = db.ref('importedData');
        await importRef.set({
          records,
          files: safeFiles,
          filesSummary: Object.keys(safeFiles),
          useSample: Boolean(useSample),
          importedAt: new Date().toISOString(),
          importedBy: req.user.userId,
        });

        return res.status(200).json({
          ok: true,
          imported: records.length,
          errors: [],
        });
      }

      if (!req.file) {
        return res.status(400).json({
          ok: false,
          errors: [{ file: null, row: null, message: 'No file uploaded. Use field name "file" or send JSON body.' }],
        });
      }

      const { records, errors } = parseCSV(req.file.buffer, req.file.originalname);

      if (records.length > 0) {
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
  }
);

// Handle multer errors
// eslint-disable-next-line no-unused-vars
router.use((err, _req, res, _next) => {
  if (err.message === 'Only CSV files are accepted.') {
    return res.status(400).json({ ok: false, errors: [{ file: null, row: null, message: err.message }] });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ ok: false, errors: [{ file: null, row: null, message: 'File too large. Maximum size is 10 MB.' }] });
  }
  return res.status(500).json({ ok: false, errors: [{ file: null, row: null, message: err.message || 'Upload failed.' }] });
});

module.exports = router;
