'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');

// Route modules
const authRoutes = require('./routes/auth');
const importRoutes = require('./routes/importRoute');
const generateRoutes = require('./routes/generate');
const scheduleRoutes = require('./routes/schedule');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
// Auth: POST /api/login, POST /api/register
app.use('/api', authRoutes);

// Import: POST /api/import
app.use('/api', importRoutes);

// Generate & Status: POST /api/generate, GET /api/status/:jobId
app.use('/api', generateRoutes);

// Schedule & Export: GET /api/schedule/:jobId, GET /api/export/solution.csv
app.use('/api', scheduleRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error.',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Schedule backend listening on port ${PORT}`);
});

module.exports = app;
