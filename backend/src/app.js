import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import datasets from './routes/datasets.js';
import jobs from './routes/jobs.js';
import templates from './routes/templates.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: CONFIG.corsOrigin === '*' ? true : CONFIG.corsOrigin.split(',') }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/health', (req, res) => res.json({ status: 'ok', uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() }));
  app.use('/api/datasets', datasets);
  app.use('/api/jobs', jobs);
  app.use('/api/templates', templates);
  app.use('/api', (req, res) => res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` }));

  // Optional: serve the built Vue app (set FRONTEND_DIST=../frontend/dist) so one Cloud service hosts both
  if (CONFIG.frontendDist && fs.existsSync(CONFIG.frontendDist)) {
    app.use(express.static(CONFIG.frontendDist));
    app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.resolve(CONFIG.frontendDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
  });
  return app;
}
